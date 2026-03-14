"""
Voice integration using Smallest AI — TTS (Lightning) and STT (Pulse).
"""

import httpx
import os

SMALLEST_API_KEY = os.getenv("SMALLEST_API_KEY", "")


async def text_to_speech(text: str, voice: str = "magnus") -> bytes:
    """Convert text to speech audio using Smallest AI Lightning TTS."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.smallest.ai/waves/v1/lightning-v3.1/get_speech",
            headers={
                "Authorization": f"Bearer {SMALLEST_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "voice_id": voice,
                "sample_rate": 24000,
                "output_format": "wav",
            },
        )
        response.raise_for_status()
        return response.content


async def speech_to_text(audio_bytes: bytes) -> str:
    """Transcribe audio using Smallest AI Pulse STT."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Pulse accepts file upload
        response = await client.post(
            "https://api.smallest.ai/waves/v1/pulse/get_text?language=en",
            headers={
                "Authorization": f"Bearer {SMALLEST_API_KEY}",
            },
            files={"file": ("audio.wav", audio_bytes, "audio/wav")},
        )
        response.raise_for_status()
        data = response.json()
        return data.get("text", "")
