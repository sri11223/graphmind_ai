# Architecture Decisions

## The Core Idea

This isn't a dashboard bolted onto a database. The whole point is that SAP O2C data is **inherently a graph** — a customer places an order, which spawns a delivery, which generates a billing document, which posts a journal entry, which gets cleared by a payment. That's a chain of causality, and a relational table completely destroys the shape of it.

So the core architectural bet was: **keep the relational data in SQLite for structured queries, but simultaneously build a graph in memory that preserves the causal structure**. Two representations of the same data, each used for what it's actually good at.

---

## Why Two Runtimes Coexist

**SQLite** handles the "give me numbers" questions. Aggregations, filters, joins across 19 tables — that's what SQL is built for. The LLM synthesises SQL and the database executes it. Fast, precise, zero hallucination on the data itself.

**NetworkX DiGraph** handles the "show me the shape" questions. How central is this customer? Which cluster of nodes operates together? What's the shortest path from this sales order to its payment? SQL can answer none of these naturally. Graph algorithms answer all of them in milliseconds once the graph is loaded.

The two never conflict because they pull from the same source of truth: the JSONL files ingested at startup.

---

## Singleton Pattern at Startup

Three module-level singletons:

```
graph_engine = GraphEngine()   # builds + owns the DiGraph
llm_engine   = LLMEngine()     # owns the Groq client
query_engine = QueryEngine(llm_engine)  # builds + owns the LRU cache
```

They're instantiated at module import time, before the FastAPI lifespan runs. The lifespan then calls `.build()` and `.init_router()` to wire them into the routers. This means there's exactly one graph in memory — no per-request rebuilds, no connection pool for the graph.

The SQLite connection is different: every query opens a fresh `sqlite3.connect()` with `row_factory = sqlite3.Row`. WAL mode was set once during `init_db()` and persists on disk, so every connection automatically benefits from it without needing to re-set the PRAGMA.

---

## Why This Runs on a Single Process

Render.com's free tier gives one container. There's no load balancer, no worker pool, no Redis. The entire system — API, graph, LLM client, SQLite — runs in one uvicorn process.

This is actually fine because:
- The graph is read-only after build. No write contention.
- SQLite in WAL mode handles concurrent reads well.
- The LLM calls are I/O-bound (network). Uvicorn's async handles them without blocking.
- The expensive graph algorithms (Louvain, betweenness centrality) are computed **once** and cached forever in instance variables.

Scaling this to multiple workers would require moving the graph to a shared memory structure or a graph database. That's a valid future direction — it just wasn't the right trade-off for this use case.

---

## Frontend Architecture

React 18 with Vite. No Redux, no context API abuse. State lives in `App.tsx` because the graph canvas, node inspector, chat panel, and analytics dashboard all need to react to the same user actions (node click, highlight, filter). Lifting state to the root prevents prop drilling nightmares at the cost of one large component.

The 3D renderer (`react-force-graph-3d`) uses Three.js under the hood and renders into a WebGL canvas. The 2D renderer (`react-force-graph-2d`) uses a plain HTML5 Canvas. They share the same node/link data structure — switching between 2D and 3D is just swapping which component renders, not re-fetching data.

Node coloring is handled by a `CLUSTER_PALETTE` + the `clusterAssignments` prop. When the user runs community detection, cluster IDs map to colors in both the canvas renderer and the Intelligence panel. The same palette is defined in both `GraphCanvas.tsx` and `GraphIntelligence.tsx` — intentionally duplicated rather than creating a shared constant that would require a module reorganisation.

---

## The Deployment Boundary

Backend → Render (Docker). Frontend → Vercel (static CDN). They communicate over HTTPS via an environment variable `VITE_API_URL`.

In production the FastAPI backend also serves the frontend directly — `GET /{full_path:path}` catches everything not matched by `/api/*` and returns `index.html`. This means the entire app can also run as a single Docker container without Vercel, which is useful for local dev and offline demos.

---

## Request Tracing

Every HTTP request gets a UUID injected by middleware, logged as `[<8-char-uuid>] METHOD /path → STATUS (Xms)`, and returned in the `X-Request-ID` response header. This was added after the first production incident (the Docker crash from a missing chown) where it was impossible to correlate frontend errors with backend logs.
