"""GraphMind AI — FastAPI Application

Startup sequence:
  1. Initialise SQLite database (create schema)
  2. Ingest JSONL data from sap-o2c-data/
  3. Build in-memory NetworkX graph
  4. Wire up LLM + query engine
  5. Serve API
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import DATA_DIR, DB_PATH, CORS_ORIGINS
from .database import init_db, get_table_stats
from .ingestion import ingest_all
from .graph_engine import GraphEngine
from .llm_engine import LLMEngine
from .query_engine import QueryEngine
from .routers import graph as graph_router
from .routers import chat as chat_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger(__name__)

graph_engine = GraphEngine()
llm_engine = LLMEngine()
query_engine = QueryEngine(llm_engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
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

    yield  # app is running

    # --- SHUTDOWN ---
    log.info("Shutting down GraphMind AI")


app = FastAPI(
    title="GraphMind AI",
    description="Graph-based SAP O2C analytics with LLM-powered natural language queries",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph_router.router)
app.include_router(chat_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "graph": graph_engine.get_stats()}
