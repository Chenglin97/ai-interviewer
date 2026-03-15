# AI Interviewer
<img width="1280" height="573" alt="Screen Shot 2026-03-14 at 10 34 47 PM" src="https://github.com/user-attachments/assets/fe140133-cdc3-416c-80f5-01df332b9a8a" />
<img width="1222" height="510" alt="Screen Shot 2026-03-14 at 10 34 59 PM" src="https://github.com/user-attachments/assets/939ced54-8701-4da1-9377-a6fcff663f6e" />

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
- `SMALLEST_API_KEY` — Get from [app.smallest.ai](https://app.smallest.ai)
