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

IMPORTANT: Do NOT evaluate or score the candidate during the interview.
Your only job right now is to have a natural, thorough conversation.
Ask good questions, probe for depth, and let the candidate fully express themselves.
Evaluation happens separately after the interview is over.

Green flags to listen for (use these to guide follow-ups, not to score): {green_flags}
Red flags to watch for (use these to probe deeper, not to judge): {red_flags}

AUTHENTICITY PROBING:
- If an answer sounds rehearsed or generic, ask for specifics naturally:
  "Can you walk me through the exact steps you took?"
  "What surprised you most about that experience?"
  "What would you do differently if you faced that again?"

RESPONSE FORMAT:
Output valid JSON:
{{
  "spoken_response": "What you say out loud to the candidate",
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
    try:
        return await chat_json(system_prompt, conversation_history, temperature=0.7)
    except Exception:
        # Fallback if JSON parsing fails — ask the agent to continue naturally
        return {
            "spoken_response": "Sorry, could you repeat that? I want to make sure I understand you correctly.",
            "next_action": "follow_up",
        }


async def generate_report(
    system_prompt: str,
    conversation_history: list[dict],
) -> dict:
    """Generate a comprehensive post-interview report from the full transcript."""
    report_prompt = """The interview is now over. Review the ENTIRE conversation transcript and produce a comprehensive, inclusive interview report.

Do NOT just score pass/fail. Instead, paint a full picture of the candidate — what they said, how they said it, patterns you noticed, and what it all means for the role.

Output valid JSON:
{
  "executive_summary": "3-5 sentence holistic assessment of the candidate, written for a hiring manager who wasn't in the room",
  "overall_score": <1-10>,
  "conversation_arc": "How did the interview flow? Did the candidate warm up over time, stay consistent, or fade? Note any turning points.",
  "per_topic": [
    {
      "topic": "The topic or question area discussed",
      "what_they_said": "Key points and specific examples the candidate gave",
      "depth_of_knowledge": "How deep did they go? Surface-level, working knowledge, or expert?",
      "authenticity": "Did their answers feel genuine and specific, or rehearsed and generic?",
      "notable_moments": "Any standout quotes, strong examples, or red flags"
    }
  ],
  "strengths": ["Specific strengths with evidence from the conversation"],
  "concerns": ["Specific concerns with evidence — not assumptions"],
  "communication_style": "How did they communicate? Clear and structured, rambly, concise, evasive on certain topics?",
  "cultural_signals": "Any signals about how they work with teams, handle feedback, approach problems?",
  "recommendation": "strong_yes | yes | maybe | no | strong_no",
  "recommendation_reasoning": "Why this recommendation? What tipped it?"
}"""

    messages = conversation_history + [{"role": "user", "content": report_prompt}]
    return await chat_json(system_prompt, messages, temperature=0.3, max_tokens=4096)
