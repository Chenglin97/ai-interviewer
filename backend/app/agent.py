"""
Interview agent — builds system prompts from role config and manages
the conversational interview loop via an LLM.
"""

from .models import RoleConfig, Question
from .llm import chat_json

SYSTEM_TEMPLATE = """You are a professional interviewer conducting a voice interview for the role: {title}

COMPANY CONTEXT:
{company_context}

QUESTIONS TO COVER (in priority order):
{questions_block}

INTERVIEW STYLE: {style}
- Ask one question at a time
- Listen to the full answer before responding
- Ask up to {follow_up_depth} natural follow-ups per question before moving on
- Be conversational and warm, not robotic — react genuinely to what they say
- Use transitions like "That's interesting..." or "Building on that..."

EVALUATION (internal — never share scores with the candidate):
Green flags to listen for: {green_flags}
Red flags to watch for: {red_flags}

AUTHENTICITY DETECTION:
- If an answer sounds rehearsed, generic, or AI-generated, probe deeper:
  "Can you walk me through the exact steps you took?"
  "What surprised you most about that experience?"
  "What would you do differently if you faced that again?"
- If they can't add specifics after probing, note low authenticity.

RESPONSE FORMAT:
After processing each candidate response, output valid JSON:
{{
  "spoken_response": "What you say out loud to the candidate",
  "internal_scores": {{
    "relevance": <1-5>,
    "depth": <1-5>,
    "authenticity": <1-5>,
    "notes": "brief internal note"
  }},
  "next_action": "follow_up | next_question | wrap_up"
}}"""


def build_system_prompt(
    title: str,
    company_context: str | None,
    questions: list[Question],
    config: RoleConfig,
) -> str:
    questions_block = "\n".join(
        f"  {i+1}. [weight={q.weight}] {q.text}" for i, q in enumerate(questions)
    )
    return SYSTEM_TEMPLATE.format(
        title=title,
        company_context=company_context or "Not provided",
        questions_block=questions_block,
        style=config.style,
        follow_up_depth=config.follow_up_depth,
        green_flags=", ".join(config.green_flags) or "None specified",
        red_flags=", ".join(config.red_flags) or "None specified",
    )


async def get_agent_response(
    system_prompt: str,
    conversation_history: list[dict],
) -> dict:
    """Send conversation to LLM and get structured interview response."""
    return await chat_json(system_prompt, conversation_history, temperature=0.7)


async def generate_scorecard(
    system_prompt: str,
    conversation_history: list[dict],
) -> dict:
    """Generate a final scorecard from the full interview transcript."""
    scorecard_prompt = """Based on the full interview transcript, generate a comprehensive scorecard.

Output valid JSON:
{
  "summary": "2-3 sentence overall assessment",
  "overall_score": <1-10>,
  "per_question": [
    {
      "question": "the question asked",
      "score": <1-5>,
      "notes": "key observations",
      "authenticity_flag": true/false
    }
  ],
  "strengths": ["list of strengths"],
  "concerns": ["list of concerns"],
  "recommendation": "strong_yes | yes | maybe | no | strong_no"
}"""

    messages = conversation_history + [{"role": "user", "content": scorecard_prompt}]
    return await chat_json(system_prompt, messages, temperature=0.3)
