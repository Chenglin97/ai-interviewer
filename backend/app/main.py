import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, get_db
from .models import RoleCreate, RoleResponse, SessionCreate, SessionResponse, Question, RoleConfig
from .agent import build_system_prompt, get_agent_response, generate_scorecard
from .voice import text_to_speech, speech_to_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AI Interviewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Role CRUD ────────────────────────────────────────────────────────────────


@app.post("/api/roles", response_model=RoleResponse)
async def create_role(body: RoleCreate):
    role_id = str(uuid.uuid4())[:8]
    db = await get_db()
    await db.execute(
        "INSERT INTO roles (id, title, company_context, questions, config) VALUES (?, ?, ?, ?, ?)",
        (
            role_id,
            body.title,
            body.company_context,
            json.dumps([q.model_dump() for q in body.questions]),
            json.dumps(body.config.model_dump()),
        ),
    )
    await db.commit()
    row = await db.execute("SELECT * FROM roles WHERE id = ?", (role_id,))
    role = await row.fetchone()
    await db.close()
    return _role_from_row(role)


@app.get("/api/roles", response_model=list[RoleResponse])
async def list_roles():
    db = await get_db()
    cursor = await db.execute("SELECT * FROM roles ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    await db.close()
    return [_role_from_row(r) for r in rows]


@app.get("/api/roles/{role_id}", response_model=RoleResponse)
async def get_role(role_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM roles WHERE id = ?", (role_id,))
    role = await cursor.fetchone()
    await db.close()
    if not role:
        raise HTTPException(404, "Role not found")
    return _role_from_row(role)


def _role_from_row(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "company_context": row["company_context"],
        "questions": json.loads(row["questions"]),
        "config": json.loads(row["config"]),
        "created_at": row["created_at"],
    }


# ─── Session CRUD ─────────────────────────────────────────────────────────────


@app.post("/api/sessions", response_model=SessionResponse)
async def create_session(body: SessionCreate):
    session_id = str(uuid.uuid4())[:8]
    db = await get_db()
    # Verify role exists
    cursor = await db.execute("SELECT id FROM roles WHERE id = ?", (body.role_id,))
    if not await cursor.fetchone():
        await db.close()
        raise HTTPException(404, "Role not found")
    await db.execute(
        "INSERT INTO sessions (id, role_id, candidate_name) VALUES (?, ?, ?)",
        (session_id, body.role_id, body.candidate_name),
    )
    await db.commit()
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    session = await cursor.fetchone()
    await db.close()
    return dict(session)


@app.get("/api/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    session = await cursor.fetchone()
    await db.close()
    if not session:
        raise HTTPException(404, "Session not found")
    return dict(session)


@app.get("/api/sessions/{session_id}/scorecard")
async def get_scorecard(session_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM scorecards WHERE session_id = ?", (session_id,))
    card = await cursor.fetchone()
    await db.close()
    if not card:
        raise HTTPException(404, "Scorecard not found")
    return {
        "session_id": card["session_id"],
        "summary": card["summary"],
        "overall_score": card["overall_score"],
        "per_question": json.loads(card["per_question"]),
    }


# ─── WebSocket Interview ─────────────────────────────────────────────────────


@app.websocket("/api/ws/interview/{session_id}")
async def interview_ws(ws: WebSocket, session_id: str):
    await ws.accept()

    db = await get_db()
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    session = await cursor.fetchone()
    if not session:
        await ws.close(code=4004, reason="Session not found")
        await db.close()
        return

    cursor = await db.execute("SELECT * FROM roles WHERE id = ?", (session["role_id"],))
    role = await cursor.fetchone()
    await db.close()

    questions = [Question(**q) for q in json.loads(role["questions"])]
    config = RoleConfig(**json.loads(role["config"]))
    system_prompt = build_system_prompt(role["title"], role["company_context"], questions, config)

    conversation_history: list[dict] = []

    # Mark session active
    db = await get_db()
    await db.execute(
        "UPDATE sessions SET status = 'active', started_at = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), session_id),
    )
    await db.commit()
    await db.close()

    # Agent opens the interview
    opening = await get_agent_response(system_prompt, conversation_history)
    spoken = opening.get("spoken_response", "Hello! Let's get started.")
    conversation_history.append({"role": "assistant", "content": json.dumps(opening)})

    # Send text + audio
    await ws.send_json({"type": "agent_text", "text": spoken})
    try:
        audio = await text_to_speech(spoken)
        await ws.send_bytes(audio)
    except Exception:
        pass  # Degrade gracefully — text still works

    try:
        while True:
            message = await ws.receive()

            if message.get("type") == "websocket.receive":
                # Could be text (typed) or bytes (audio)
                if "text" in message:
                    data = json.loads(message["text"])
                    candidate_text = data.get("text", "")
                elif "bytes" in message:
                    candidate_text = await speech_to_text(message["bytes"])
                    await ws.send_json({"type": "transcript", "text": candidate_text})
                else:
                    continue

                if not candidate_text.strip():
                    continue

                # Save transcript
                db = await get_db()
                await db.execute(
                    "INSERT INTO transcripts (session_id, speaker, text) VALUES (?, ?, ?)",
                    (session_id, "candidate", candidate_text),
                )
                await db.commit()
                await db.close()

                conversation_history.append({"role": "user", "content": candidate_text})

                # Get agent response
                agent_resp = await get_agent_response(system_prompt, conversation_history)
                spoken = agent_resp.get("spoken_response", "")
                conversation_history.append({"role": "assistant", "content": json.dumps(agent_resp)})

                # Save agent transcript
                db = await get_db()
                scores = agent_resp.get("internal_scores", {})
                await db.execute(
                    "INSERT INTO transcripts (session_id, speaker, text, scores) VALUES (?, ?, ?, ?)",
                    (session_id, "agent", spoken, json.dumps(scores)),
                )
                await db.commit()
                await db.close()

                # Send response
                await ws.send_json({
                    "type": "agent_text",
                    "text": spoken,
                    "scores": scores,
                    "next_action": agent_resp.get("next_action", "follow_up"),
                })

                try:
                    audio = await text_to_speech(spoken)
                    await ws.send_bytes(audio)
                except Exception:
                    pass

                # Check if interview should end
                if agent_resp.get("next_action") == "wrap_up":
                    # Generate scorecard
                    scorecard = await generate_scorecard(system_prompt, conversation_history)
                    db = await get_db()
                    await db.execute(
                        "INSERT INTO scorecards (session_id, summary, overall_score, per_question) VALUES (?, ?, ?, ?)",
                        (
                            session_id,
                            scorecard.get("summary", ""),
                            scorecard.get("overall_score", 0),
                            json.dumps(scorecard.get("per_question", [])),
                        ),
                    )
                    await db.execute(
                        "UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?",
                        (datetime.now(timezone.utc).isoformat(), session_id),
                    )
                    await db.commit()
                    await db.close()

                    await ws.send_json({"type": "interview_complete", "scorecard": scorecard})
                    await ws.close()
                    return

    except WebSocketDisconnect:
        db = await get_db()
        await db.execute(
            "UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), session_id),
        )
        await db.commit()
        await db.close()
