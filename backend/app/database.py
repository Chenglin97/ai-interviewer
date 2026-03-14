import aiosqlite
import json
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "interview.db"


async def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    db = await get_db()
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            company_context TEXT,
            questions TEXT NOT NULL,  -- JSON array
            config TEXT,             -- JSON object (style, follow_up_depth, flags)
            agent_template TEXT,     -- Generated system prompt for the interviewer agent
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            role_id TEXT NOT NULL,
            candidate_name TEXT,
            status TEXT DEFAULT 'pending',  -- pending, active, completed
            started_at DATETIME,
            ended_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (role_id) REFERENCES roles(id)
        );

        CREATE TABLE IF NOT EXISTS transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            speaker TEXT NOT NULL,  -- 'agent' or 'candidate'
            text TEXT NOT NULL,
            scores TEXT,  -- JSON object (relevance, depth, authenticity)
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );

        CREATE TABLE IF NOT EXISTS scorecards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL UNIQUE,
            summary TEXT,
            overall_score REAL,
            per_question TEXT,  -- JSON array
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );
    """)
    await db.commit()
    await db.close()
