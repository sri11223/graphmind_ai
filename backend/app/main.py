"""GraphMind AI — FastAPI Application

Startup sequence:
  1. Validate configuration (fail-fast on missing keys)
  2. Initialise SQLite database (create schema)
  3. Ingest JSONL data from sap-o2c-data/
  4. Build in-memory NetworkX graph
  5. Wire up LLM + query engine
  6. Serve API + static frontend (production)
"""

import logging
import time
import uuid

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import DATA_DIR, DB_PATH, CORS_ORIGINS, GROQ_API_KEY, APP_VERSION
from .database import init_db, get_table_stats
from .ingestion import ingest_all
from .graph_engine import GraphEngine
from .llm_engine import LLMEngine
from .query_engine import QueryEngine
from .schemas import HealthResponse, ErrorResponse, StatsResponse
from .routers import graph as graph_router
from .routers import chat as chat_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-5s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

graph_engine = GraphEngine()
llm_engine = LLMEngine()
query_engine = QueryEngine(llm_engine)

_start_time: float = 0.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _start_time

    # --- STARTUP VALIDATION ---
    if not GROQ_API_KEY:
        log.warning("GROQ_API_KEY is not set — LLM queries will fail")

    _start_time = time.time()
    log.info("Starting GraphMind AI v%s", APP_VERSION)

    log.info("Initialising database at %s", DB_PATH)
    init_db(DB_PATH)

    stats = get_table_stats()
    total_rows = sum(stats.values())
    if total_rows == 0:
        log.info("Database empty — ingesting data from %s", DATA_DIR)
        counts = ingest_all(DATA_DIR)
        log.info("Ingestion complete: %s", counts)
    else:
        log.info("Database already populated (%d total rows)", total_rows)

    log.info("Building graph …")
    graph_engine.build()
    g_stats = graph_engine.get_stats()
    log.info("Graph ready: %d nodes, %d edges", g_stats["totalNodes"], g_stats["totalEdges"])

    # Wire routers to engines
    graph_router.init_router(graph_engine)
    chat_router.init_router(query_engine)

    elapsed = time.time() - _start_time
    log.info("Startup complete in %.1fs", elapsed)

    yield  # app is running

    # --- SHUTDOWN ---
    log.info("Shutting down GraphMind AI")


# ── OpenAPI metadata ──────────────────────────────────────────────

API_DESCRIPTION = """
## Graph-based SAP Order-to-Cash Analytics

GraphMind AI ingests SAP O2C transactional data, builds an in-memory knowledge graph,
and lets users explore it through:

- **Interactive 3D/2D force-directed graph** visualisation
- **Natural language queries** powered by Groq LLM (llama-3.3-70b)
- **Real-time WebSocket streaming** for progressive responses
- **O2C analytics dashboard** with KPI funnel, revenue trends, and top-N rankings

### API Groups

| Tag | Description |
|-----|-------------|
| **graph** | Graph data, node detail, search, analytics, path finder |
| **chat** | Natural language query (REST + WebSocket), suggestions, export |
| **system** | Health check, API metadata |

### Authentication
No authentication required (public demo). Configure `CORS_ORIGINS` in production.
"""

TAGS_METADATA = [
    {"name": "system", "description": "Health checks and API metadata"},
    {"name": "graph", "description": "Knowledge graph data, search, analytics, and path finding"},
    {"name": "chat", "description": "LLM-powered natural language queries with streaming"},
]

app = FastAPI(
    title="GraphMind AI",
    description=API_DESCRIPTION,
    version=APP_VERSION,
    openapi_tags=TAGS_METADATA,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    responses={
        422: {"model": ErrorResponse, "description": "Validation error"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)

# ── Middleware ─────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log every request with method, path, status, and duration."""
    request_id = uuid.uuid4().hex[:8]
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    log.info(
        "[%s] %s %s → %d (%.0fms)",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    response.headers["X-Request-ID"] = request_id
    return response


# ── Exception handlers ────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "Validation error", "detail": str(exc)},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal server error", "detail": None},
    )


# ── Routers ───────────────────────────────────────────────────────

app.include_router(graph_router.router)
app.include_router(chat_router.router)


# ── System endpoints ──────────────────────────────────────────────

@app.get(
    "/api/health",
    response_model=HealthResponse,
    tags=["system"],
    summary="Health check",
    description="Returns API status, version, graph statistics, database row counts, and uptime.",
)
def health():
    db_stats = get_table_stats()
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        graph=StatsResponse(**graph_engine.get_stats()),
        database={"tables": len(db_stats), "totalRows": sum(db_stats.values())},
        uptime_seconds=round(time.time() - _start_time, 1),
    )


# ── Static files (production SPA) ────────────────────────────────

_STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _STATIC_DIR.is_dir():
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Catch-all: serve index.html for client-side routing."""
        file_path = (_STATIC_DIR / full_path).resolve()
        # Guard against path traversal (e.g. ../../backend/app/config.py)
        if file_path.is_relative_to(_STATIC_DIR) and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_STATIC_DIR / "index.html")
