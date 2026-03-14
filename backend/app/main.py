import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / ".env")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, get_db
from .models import RoleCreate, RoleResponse, SessionCreate, SessionResponse, Question, RoleConfig
from .agent import build_system_prompt, get_agent_response, generate_scorecard
from .onboarding_agent import get_onboarding_response, generate_agent_template
from .voice import text_to_speech, speech_to_text
from .llm import get_spend_status


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


# ─── Spend monitoring ─────────────────────────────────────────────────────────


@app.get("/api/spend")
async def spend_status():
    return get_spend_status()


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


# ─── Role Stats & Session Review ─────────────────────────────────────────────


@app.get("/api/roles/{role_id}/stats")
async def get_role_stats(role_id: str):
    """Get interview stats for a role: total candidates, completed, average score."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM roles WHERE id = ?", (role_id,))
    if not await cursor.fetchone():
        await db.close()
        raise HTTPException(404, "Role not found")

    cursor = await db.execute(
        "SELECT COUNT(*) as total, "
        "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, "
        "SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active "
        "FROM sessions WHERE role_id = ?",
        (role_id,),
    )
    row = await cursor.fetchone()

    cursor = await db.execute(
        "SELECT AVG(sc.overall_score) as avg_score "
        "FROM scorecards sc JOIN sessions s ON sc.session_id = s.id "
        "WHERE s.role_id = ?",
        (role_id,),
    )
    score_row = await cursor.fetchone()
    await db.close()

    return {
        "total_candidates": row["total"],
        "completed": row["completed"],
        "active": row["active"],
        "average_score": round(score_row["avg_score"], 1) if score_row["avg_score"] else None,
    }


@app.get("/api/roles/{role_id}/sessions")
async def list_role_sessions(role_id: str):
    """List all interview sessions for a role with their scorecard summary."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT s.*, sc.overall_score, sc.summary as scorecard_summary "
        "FROM sessions s LEFT JOIN scorecards sc ON s.id = sc.session_id "
        "WHERE s.role_id = ? ORDER BY s.created_at DESC",
        (role_id,),
    )
    rows = await cursor.fetchall()
    await db.close()

    return [
        {
            "id": r["id"],
            "candidate_name": r["candidate_name"],
            "status": r["status"],
            "started_at": r["started_at"],
            "ended_at": r["ended_at"],
            "overall_score": r["overall_score"],
            "scorecard_summary": r["scorecard_summary"],
        }
        for r in rows
    ]


@app.get("/api/sessions/{session_id}/transcript")
async def get_session_transcript(session_id: str):
    """Get full transcript for a session with per-message scores."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
    if not await cursor.fetchone():
        await db.close()
        raise HTTPException(404, "Session not found")

    cursor = await db.execute(
        "SELECT speaker, text, scores, timestamp FROM transcripts "
        "WHERE session_id = ? ORDER BY timestamp ASC",
        (session_id,),
    )
    rows = await cursor.fetchall()
    await db.close()

    return [
        {
            "speaker": r["speaker"],
            "text": r["text"],
            "scores": json.loads(r["scores"]) if r["scores"] else None,
            "timestamp": r["timestamp"],
        }
        for r in rows
    ]


# ─── Manual Agent Generation ─────────────────────────────────────────────────


@app.post("/api/roles/generate")
async def generate_role_from_config(body: dict):
    """Manually generate an agent from extracted onboarding config."""
    extracted = body.get("extracted", {})
    if not extracted.get("title"):
        raise HTTPException(400, "Missing title in extracted config")

    role_id = str(uuid.uuid4())[:8]
    questions = extracted.get("questions", [])
    config = {
        "style": extracted.get("style", "conversational"),
        "follow_up_depth": extracted.get("follow_up_depth", 2),
        "red_flags": extracted.get("red_flags", []),
        "green_flags": extracted.get("green_flags", []),
    }

    agent_template = await generate_agent_template(extracted)

    db = await get_db()
    await db.execute(
        "INSERT INTO roles (id, title, company_context, questions, config, agent_template) VALUES (?, ?, ?, ?, ?, ?)",
        (
            role_id,
            extracted["title"],
            extracted.get("company_context"),
            json.dumps(questions),
            json.dumps(config),
            agent_template,
        ),
    )
    await db.commit()
    await db.close()

    return {"role_id": role_id, "title": extracted["title"]}


# ─── WebSocket Onboarding (Employer Voice Setup) ─────────────────────────────


@app.websocket("/api/ws/onboarding")
async def onboarding_ws(ws: WebSocket):
    await ws.accept()

    conversation_history: list[dict] = [
        {"role": "user", "content": "Hi, I'd like to set up an interview."}
    ]

    # Agent opens the conversation
    opening = await get_onboarding_response(conversation_history)
    spoken = opening.get("spoken_response", "Hi! Let's set up your interview. What role are you hiring for?")
    conversation_history.append({"role": "assistant", "content": json.dumps(opening)})

    await ws.send_json({"type": "agent_text", "text": spoken, "status": opening.get("status", "gathering")})
    try:
        audio = await text_to_speech(spoken)
        await ws.send_bytes(audio)
    except Exception:
        pass

    try:
        while True:
            message = await ws.receive()

            if message.get("type") == "websocket.receive":
                if "text" in message:
                    data = json.loads(message["text"])
                    employer_text = data.get("text", "")
                    interrupted_context = data.get("interrupted_context", "")
                elif "bytes" in message:
                    employer_text = await speech_to_text(message["bytes"])
                    interrupted_context = ""
                    await ws.send_json({"type": "transcript", "text": employer_text})
                else:
                    continue

                if not employer_text.strip():
                    continue

                # If user interrupted, add context so agent knows
                user_msg = employer_text
                if interrupted_context:
                    user_msg = f"{interrupted_context}\n\nUser said: {employer_text}"

                conversation_history.append({"role": "user", "content": user_msg})

                agent_resp = await get_onboarding_response(conversation_history)
                spoken = agent_resp.get("spoken_response", "")
                conversation_history.append({"role": "assistant", "content": json.dumps(agent_resp)})

                status = agent_resp.get("status", "gathering")
                extracted = agent_resp.get("extracted_so_far", {})

                await ws.send_json({
                    "type": "agent_text",
                    "text": spoken,
                    "status": status,
                    "extracted": extracted,
                })

                try:
                    audio = await text_to_speech(spoken)
                    await ws.send_bytes(audio)
                except Exception:
                    pass

                # Onboarding complete — generate agent template and save the role
                if status == "complete" and extracted.get("title"):
                    await ws.send_json({"type": "status", "text": "Generating your interviewer agent..."})

                    role_id = str(uuid.uuid4())[:8]
                    questions = extracted.get("questions", [])
                    config = {
                        "style": extracted.get("style", "conversational"),
                        "follow_up_depth": extracted.get("follow_up_depth", 2),
                        "red_flags": extracted.get("red_flags", []),
                        "green_flags": extracted.get("green_flags", []),
                    }

                    # Generate a full agent system prompt from the conversation
                    agent_template = await generate_agent_template(extracted)

                    db = await get_db()
                    await db.execute(
                        "INSERT INTO roles (id, title, company_context, questions, config, agent_template) VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            role_id,
                            extracted["title"],
                            extracted.get("company_context"),
                            json.dumps(questions),
                            json.dumps(config),
                            agent_template,
                        ),
                    )
                    await db.commit()
                    await db.close()

                    await ws.send_json({
                        "type": "onboarding_complete",
                        "role_id": role_id,
                        "role": {
                            "id": role_id,
                            "title": extracted["title"],
                            "questions": questions,
                            "config": config,
                        },
                    })
                    await ws.close()
                    return

    except WebSocketDisconnect:
        pass


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

    # Use the generated agent template if available, otherwise fall back to builder
    agent_template = role["agent_template"] if "agent_template" in role.keys() else None
    if agent_template:
        system_prompt = agent_template
    else:
        questions = [Question(**q) for q in json.loads(role["questions"])]
        config = RoleConfig(**json.loads(role["config"]))
        system_prompt = build_system_prompt(role["title"], role["company_context"], questions, config)

    conversation_history: list[dict] = [
        {"role": "user", "content": "Hi, I'm ready for the interview."}
    ]

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
                    interrupted_context = data.get("interrupted_context", "")
                elif "bytes" in message:
                    candidate_text = await speech_to_text(message["bytes"])
                    interrupted_context = ""
                    await ws.send_json({"type": "transcript", "text": candidate_text})
                else:
                    continue

                if not candidate_text.strip():
                    continue

                # Save transcript (raw user text)
                db = await get_db()
                await db.execute(
                    "INSERT INTO transcripts (session_id, speaker, text) VALUES (?, ?, ?)",
                    (session_id, "candidate", candidate_text),
                )
                await db.commit()
                await db.close()

                # If user interrupted, add context so agent knows
                user_msg = candidate_text
                if interrupted_context:
                    user_msg = f"{interrupted_context}\n\nCandidate said: {candidate_text}"

                conversation_history.append({"role": "user", "content": user_msg})

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
