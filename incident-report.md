# OpenAI API Usage Spike — Incident Report

## Summary

Hi there! I'm reaching out because I noticed an unexpected usage spike on my account from **March 14, 2026**. A WebSocket reconnection loop bug in a local development project accidentally triggered around **30,470 API calls** to the `gpt-4o` Chat Completions endpoint within a single session. Every request was identical — same system prompt, empty conversation — so none of it produced any real value.

I completely understand this was caused by a bug on my end, and I've already fixed it. That said, I'd really appreciate it if the team could consider issuing a credit for the affected charges, since the usage was entirely unintentional. Any help would be greatly appreciated!

## Timeline

| Time | Event |
|------|-------|
| ~19:46 UTC | Backend server started locally (`uvicorn`, port 8000) |
| ~19:46 UTC | Frontend dev server started (`vite`, port 3000) |
| ~19:46 UTC | WebSocket reconnection loop begins |
| Shortly after | Loop detected and servers killed |

## Root Cause

The application is an AI-powered voice interview tool built during a hackathon. It uses a WebSocket connection between a React frontend and a FastAPI backend. On each WebSocket connection to `/api/ws/onboarding`, the backend makes one `gpt-4o` Chat Completions API call to generate an opening message.

**The bug:** The React frontend's `useEffect` hook that managed the WebSocket connection included **unstable callback references** (inline arrow functions) in its dependency array. This caused React to:

1. Create the WebSocket connection → triggers 1 OpenAI API call
2. Receive the response → update component state
3. State update causes re-render → callback references change
4. Changed dependencies cause `useEffect` cleanup → WebSocket closed
5. `useEffect` re-runs → new WebSocket connection → another OpenAI API call
6. **Repeat infinitely**

This is a well-known React anti-pattern. The fix (storing callbacks in `useRef`) was applied during the same session, but not before the loop had already executed.

## Evidence from Server Logs

```
Total WebSocket connections accepted:  30,470
All to single endpoint:                /api/ws/onboarding
WebSocket disconnection errors:        75,814
Server log file size:                  172 MB
Source IP:                             127.0.0.1 (localhost only)
```

**All 30,470 connections were to the same endpoint**, each triggering one identical `gpt-4o` call with the same system prompt. No meaningful conversation or user interaction occurred — every connection was opened and immediately closed by the reconnection loop.

## Key Facts Supporting Refund

1. **100% unintentional** — caused by a React useEffect dependency bug, not user activity
2. **Zero user value** — no actual interviews were conducted; every request was an identical opening prompt
3. **Localhost only** — all traffic from `127.0.0.1`, single developer machine during local development
4. **Single endpoint** — all 30,470 requests hit `/api/ws/onboarding` with identical payloads
5. **Short time window** — entire spike occurred within a single development session
6. **Hackathon project** — this was a prototype being built during Voice HackSprint 2.0, not a production service
7. **Bug already fixed** — the root cause has been identified and resolved

## API Call Details

- **Model:** `gpt-4o`
- **Endpoint:** `POST /v1/chat/completions`
- **Payload:** Single system prompt (~500 tokens) + empty conversation history
- **Response:** ~100-200 tokens each (JSON object with opening message)
- **Estimated tokens:** ~30,470 × ~700 tokens ≈ 21.3M tokens
- **Temperature:** 0.7
- **response_format:** `json_object`

## Contact

- **Account holder:** Chenglin Wei
- **Project:** github.com/Chenglin97/ai-interviewer
- **Date of incident:** March 14, 2026
