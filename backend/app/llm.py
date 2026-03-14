"""
Shared LLM client with rate limiting and daily spend cap.
Swap between providers by changing the client/model here.
"""

import json
import asyncio
import time
import os
from datetime import date
from anthropic import AsyncAnthropic

client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

MODEL = "claude-haiku-4-5-20251001"

# ─── Pricing (per million tokens) ────────────────────────────────────────────
# Claude Haiku 4.5: $1/M input, $5/M output
PRICE_INPUT_PER_TOKEN = 1.0 / 1_000_000
PRICE_OUTPUT_PER_TOKEN = 5.0 / 1_000_000

# ─── Rate limiter ────────────────────────────────────────────────────────────

MAX_REQUESTS_PER_MINUTE = 60
_request_timestamps: list[float] = []
_rate_lock = asyncio.Lock()


async def _rate_limit():
    """Simple sliding window rate limiter."""
    async with _rate_lock:
        now = time.monotonic()
        while _request_timestamps and _request_timestamps[0] < now - 60:
            _request_timestamps.pop(0)

        if len(_request_timestamps) >= MAX_REQUESTS_PER_MINUTE:
            wait = 60 - (now - _request_timestamps[0])
            if wait > 0:
                await asyncio.sleep(wait)

        _request_timestamps.append(time.monotonic())


# ─── Daily spend cap ─────────────────────────────────────────────────────────

DAILY_SPEND_LIMIT = float(os.getenv("DAILY_SPEND_LIMIT", "50.0"))  # $50 default
_spend_lock = asyncio.Lock()
_daily_spend = 0.0
_spend_date = date.today()
_total_requests_today = 0


class SpendLimitExceeded(Exception):
    pass


async def _track_spend(input_tokens: int, output_tokens: int):
    """Track daily spend and raise if limit exceeded."""
    global _daily_spend, _spend_date, _total_requests_today

    async with _spend_lock:
        today = date.today()
        if today != _spend_date:
            # New day — reset
            _daily_spend = 0.0
            _spend_date = today
            _total_requests_today = 0

        cost = (input_tokens * PRICE_INPUT_PER_TOKEN) + (output_tokens * PRICE_OUTPUT_PER_TOKEN)
        _daily_spend += cost
        _total_requests_today += 1


async def _check_budget():
    """Check if we're still within budget before making a request."""
    global _daily_spend, _spend_date

    async with _spend_lock:
        today = date.today()
        if today != _spend_date:
            _daily_spend = 0.0
            _spend_date = today

        if _daily_spend >= DAILY_SPEND_LIMIT:
            raise SpendLimitExceeded(
                f"Daily spend limit of ${DAILY_SPEND_LIMIT:.2f} reached "
                f"(${_daily_spend:.2f} spent today across {_total_requests_today} requests). "
                f"Resets at midnight."
            )


def get_spend_status() -> dict:
    """Get current spend status (for API/debugging)."""
    return {
        "daily_limit": DAILY_SPEND_LIMIT,
        "spent_today": round(_daily_spend, 4),
        "remaining": round(DAILY_SPEND_LIMIT - _daily_spend, 4),
        "requests_today": _total_requests_today,
        "date": str(_spend_date),
    }


# ─── Chat completion wrapper ─────────────────────────────────────────────────


async def chat(
    system: str,
    messages: list[dict],
    temperature: float = 0.7,
) -> str:
    """Send a chat completion request with rate limiting and spend tracking."""
    await _check_budget()
    await _rate_limit()

    response = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
        temperature=temperature,
    )

    # Track spend from actual usage
    await _track_spend(response.usage.input_tokens, response.usage.output_tokens)

    return response.content[0].text


async def chat_json(
    system: str,
    messages: list[dict],
    temperature: float = 0.7,
) -> dict:
    """Send a chat completion and parse JSON response."""
    system_with_json = system.rstrip() + "\n\nIMPORTANT: Respond with valid JSON only. No markdown fences, no extra text."

    text = await chat(system_with_json, messages, temperature)

    # Strip markdown fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    return json.loads(text)
