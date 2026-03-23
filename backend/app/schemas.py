"""GraphMind AI — Pydantic Schemas"""

from typing import Literal
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


class ChatResponse(BaseModel):
    answer: str
    sql: str | None = None
    data: list[dict] | None = None
    referencedNodes: list[str] = []


class ExportRequest(BaseModel):
    data: list[dict]
    format: Literal["csv", "json"] = "csv"
