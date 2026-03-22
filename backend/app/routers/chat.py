"""Chat API endpoint."""

from fastapi import APIRouter
from ..schemas import ChatRequest, ChatResponse
from ..query_engine import QueryEngine

router = APIRouter(prefix="/api/chat", tags=["chat"])

_engine: QueryEngine | None = None


def init_router(engine: QueryEngine):
    global _engine
    _engine = engine


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest):
    result = _engine.process(req.message, req.history)
    return ChatResponse(**result)
