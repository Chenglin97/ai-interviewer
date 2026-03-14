from pydantic import BaseModel
from typing import Optional


class Question(BaseModel):
    text: str
    weight: int = 1


class RoleConfig(BaseModel):
    style: Optional[str] = "conversational"  # conversational | structured
    follow_up_depth: Optional[int] = 2
    red_flags: list[str] = []
    green_flags: list[str] = []


class RoleCreate(BaseModel):
    title: str
    company_context: Optional[str] = None
    questions: list[Question]
    config: RoleConfig = RoleConfig()


class RoleResponse(BaseModel):
    id: str
    title: str
    company_context: Optional[str]
    questions: list[Question]
    config: RoleConfig
    created_at: str


class SessionCreate(BaseModel):
    role_id: str
    candidate_name: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    role_id: str
    candidate_name: Optional[str]
    status: str
    started_at: Optional[str]
    ended_at: Optional[str]


class ScorecardResponse(BaseModel):
    session_id: str
    summary: str
    overall_score: float
    per_question: list[dict]
