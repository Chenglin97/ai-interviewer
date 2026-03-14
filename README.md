# AI Interviewer

AI-powered voice interview platform with real-time authenticity detection.

Built for **Voice HackSprint 2.0**.

## Architecture

- **Employer Portal** — Create interview roles with custom questions, weights, green/red flags
- **Candidate Portal** — Real-time voice interview via WebSocket with AI agent
- **Scoring Engine** — Per-question scoring with authenticity detection + final scorecard

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite |
| Backend | FastAPI + WebSocket |
| Voice | Smallest AI (Waves TTS + Lightning STT) |
| LLM | OpenAI GPT-4o |
| DB | SQLite |

## Setup

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env  # Fill in API keys
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## API Keys Needed

- `OPENAI_API_KEY` — OpenAI API key
- `SMALLEST_API_KEY` — Get from [app.smallest.ai](https://app.smallest.ai), use coupon `HACKSPRINT2-VNCCTHMP`
