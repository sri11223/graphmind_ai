"""GraphMind AI — Pydantic Schemas"""

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


class ChatResponse(BaseModel):
    answer: str
    sql: str | None = None
    data: list[dict] | None = None
    referencedNodes: list[str] = []
