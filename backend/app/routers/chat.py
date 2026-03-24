"""Chat API endpoints — REST + WebSocket streaming + export.

Provides the natural-language query interface. The REST endpoint returns
a complete response; the WebSocket endpoint streams partial results so
the frontend can show progressive updates.
"""

import csv
import io
import json
import logging
import time
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from ..schemas import ChatRequest, ChatResponse, ExportRequest, Suggestion
from ..query_engine import QueryEngine
from ..guardrails import validate_sql, is_off_topic, REFUSAL_MSG
from ..database import execute_query

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

# ---------------------------------------------------------------------------
# Simple in-process rate limiter — 20 requests per IP per 60 seconds.
# Protects the Groq API key from runaway usage.
# ---------------------------------------------------------------------------
_RATE_LIMIT = 20       # max requests
_RATE_WINDOW = 60      # seconds
_rate_buckets: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    window_start = now - _RATE_WINDOW
    bucket = _rate_buckets[ip]
    # Evict timestamps outside the current window
    _rate_buckets[ip] = [t for t in bucket if t > window_start]
    if len(_rate_buckets[ip]) >= _RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded — max {_RATE_LIMIT} requests per {_RATE_WINDOW}s.",
        )
    _rate_buckets[ip].append(now)

_engine: QueryEngine | None = None


def init_router(engine: QueryEngine):
    global _engine
    _engine = engine


@router.post(
    "",
    response_model=ChatResponse,
    summary="Ask a question",
    description="Send a natural-language question about SAP O2C data. Returns SQL, result data, and a narrative answer.",
)
def chat(req: ChatRequest, request: Request):
    _check_rate_limit(request.client.host if request.client else "unknown")
    result = _engine.process(req.message, req.history)
    return ChatResponse(**result)


@router.get(
    "/suggestions",
    response_model=list[Suggestion],
    summary="Example queries",
    description="Returns a curated list of example questions the user can try.",
)
def suggestions():
    return [
        {"text": "Show me the top 10 customers by order value", "category": "Customers"},
        {"text": "Which products have the most billing documents?", "category": "Products"},
        {"text": "Trace the full O2C flow for sales order 740506", "category": "Flow"},
        {"text": "Find orders that are delivered but not yet billed", "category": "Flow"},
        {"text": "Show all cancelled billing documents", "category": "Billing"},
        {"text": "What is the total revenue by sales organization?", "category": "Revenue"},
        {"text": "List customers with overdue payments", "category": "Payments"},
        {"text": "Show incomplete O2C flows missing billing or payment", "category": "Flow"},
        {"text": "Which plants handle the most deliveries?", "category": "Logistics"},
        {"text": "Compare order amounts vs billing amounts by customer", "category": "Analytics"},
    ]


@router.post(
    "/export",
    summary="Export data",
    description="Export query result rows as a downloadable CSV or JSON file.",
)
def export_data(req: ExportRequest):
    data = req.data
    fmt = req.format

    if fmt == "json":
        content = json.dumps(data, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=graphmind_export.json"},
        )

    # CSV
    if not data:
        return StreamingResponse(
            io.BytesIO(b""),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=graphmind_export.csv"},
        )
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=data[0].keys())
    writer.writeheader()
    writer.writerows(data)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=graphmind_export.csv"},
    )


@router.websocket("/stream")
async def chat_stream(websocket: WebSocket):
    """WebSocket endpoint that streams the LLM interpretation step."""
    await websocket.accept()
    client_ip = websocket.client.host if websocket.client else "unknown"
    try:
        while True:
            data = await websocket.receive_json()
            question = data.get("message", "")
            history = data.get("history", [])

            # Rate limit per client IP
            try:
                _check_rate_limit(client_ip)
            except HTTPException:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Rate limit exceeded — max {_RATE_LIMIT} requests per {_RATE_WINDOW}s.",
                })
                continue

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

            # Step 2: Execute SQL (with auto-retry on failure)
            await websocket.send_json({"type": "status", "status": "Executing query…"})
            try:
                results = execute_query(sql)
            except Exception as exc:
                log.warning("SQL failed, attempting auto-repair: %s", exc)
                await websocket.send_json({"type": "status", "status": "Fixing query…"})
                repair_out = _engine.llm.repair_sql(question, sql, str(exc))
                repaired_sql = repair_out.get("sql", "")
                if repaired_sql and repair_out.get("is_relevant", False):
                    valid2, _ = validate_sql(repaired_sql)
                    if valid2:
                        try:
                            sql = repaired_sql
                            results = execute_query(sql)
                            log.info("Auto-repaired SQL succeeded")
                            await websocket.send_json(
                                {"type": "sql", "sql": sql, "explanation": "(auto-corrected) " + explanation}
                            )
                        except Exception as exc2:
                            log.exception("Repaired SQL also failed: %s", sql)
                            await websocket.send_json({
                                "type": "done",
                                "answer": f"Query execution error: {exc2}. Try rephrasing.",
                                "sql": sql,
                                "referencedNodes": [],
                            })
                            continue
                    else:
                        await websocket.send_json({
                            "type": "done",
                            "answer": f"Query execution error: {exc}. Try rephrasing.",
                            "sql": sql,
                            "referencedNodes": [],
                        })
                        continue
                else:
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
