"""
Voice integration using Smallest AI — TTS (Waves) and STT (Lightning).
"""

import httpx
import os

SMALLEST_API_KEY = os.getenv("SMALLEST_API_KEY", "")
SMALLEST_BASE_URL = "https://waves-api.smallest.ai/api/v1"


async def text_to_speech(text: str, voice: str = "emily") -> bytes:
    """Convert text to speech audio using Smallest AI Waves TTS."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{SMALLEST_BASE_URL}/lightning/get_speech",
            headers={
                "Authorization": f"Bearer {SMALLEST_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "voice_id": voice,
                "sample_rate": 24000,
                "speed": 1.0,
            },
        )
        response.raise_for_status()
        return response.content


async def speech_to_text(audio_bytes: bytes) -> str:
    """Transcribe audio using Smallest AI Lightning STT."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{SMALLEST_BASE_URL}/lightning/get_text",
            headers={
                "Authorization": f"Bearer {SMALLEST_API_KEY}",
            },
            files={"file": ("audio.wav", audio_bytes, "audio/wav")},
        )
        response.raise_for_status()
        data = response.json()
        return data.get("text", "")
