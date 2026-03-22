"""Chat API endpoints — REST + WebSocket streaming."""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..schemas import ChatRequest, ChatResponse
from ..query_engine import QueryEngine
from ..guardrails import validate_sql, is_off_topic, REFUSAL_MSG
from ..database import execute_query

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

_engine: QueryEngine | None = None


def init_router(engine: QueryEngine):
    global _engine
    _engine = engine


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest):
    result = _engine.process(req.message, req.history)
    return ChatResponse(**result)


@router.websocket("/stream")
async def chat_stream(websocket: WebSocket):
    """WebSocket endpoint that streams the LLM interpretation step."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            question = data.get("message", "")
            history = data.get("history", [])

            # Guardrail: off-topic check
            if is_off_topic(question):
                await websocket.send_json(
                    {"type": "done", "answer": REFUSAL_MSG, "referencedNodes": []}
                )
                continue

            # Step 1: Generate SQL
            await websocket.send_json({"type": "status", "status": "Generating SQL…"})
            llm_out = _engine.llm.generate_sql(question, history)

            if not llm_out.get("is_relevant", True):
                await websocket.send_json({
                    "type": "done",
                    "answer": llm_out.get("refusal", REFUSAL_MSG),
                    "referencedNodes": [],
                })
                continue

            sql = llm_out.get("sql", "")
            explanation = llm_out.get("explanation", "")

            # Guardrail: SQL validation
            valid, reason = validate_sql(sql)
            if not valid:
                log.warning("SQL validation failed (%s): %s", reason, sql)
                await websocket.send_json({
                    "type": "done",
                    "answer": "I couldn't generate a safe query. Please try rephrasing.",
                    "sql": sql,
                    "referencedNodes": [],
                })
                continue

            await websocket.send_json(
                {"type": "sql", "sql": sql, "explanation": explanation}
            )

            # Step 2: Execute SQL
            await websocket.send_json({"type": "status", "status": "Executing query…"})
            try:
                results = execute_query(sql)
            except Exception as exc:
                log.exception("SQL execution failed: %s", sql)
                await websocket.send_json({
                    "type": "done",
                    "answer": f"Query execution error: {exc}. Try rephrasing.",
                    "sql": sql,
                    "referencedNodes": [],
                })
                continue

            await websocket.send_json({"type": "data", "rowCount": len(results)})

            # Step 3: Stream interpretation
            await websocket.send_json(
                {"type": "status", "status": "Analyzing results…"}
            )
            for chunk in _engine.llm.stream_interpret(question, sql, results):
                await websocket.send_json({"type": "chunk", "content": chunk})

            # Step 4: Extract node references
            referenced = QueryEngine._extract_node_refs(results)
            await websocket.send_json(
                {"type": "done", "referencedNodes": referenced}
            )

    except WebSocketDisconnect:
        log.debug("WebSocket client disconnected")
    except Exception as exc:
        log.exception("WebSocket error")
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
