# GraphMind AI — Technical Documentation

This folder documents the decisions behind GraphMind AI: what we built, why we built it this way, and where the interesting engineering lives. Not a user guide. Not a tutorial. A record of choices made by someone who had to make them.

---

## Documents

| Doc | What it covers |
|-----|---------------|
| [Architecture Decisions](./architecture.md) | Why two runtimes (SQLite + NetworkX DiGraph) exist simultaneously, the singleton pattern, why a single process works, and how the frontend state is organised |
| [Database: SQLite Deep Dive](./database.md) | Why SQLite over Postgres, how WAL mode works, exactly which 23 indexes exist and why each one was added, the four pre-built views, and the row-cap strategy |
| [LLM Prompting Strategy](./llm-strategy.md) | The two-stage pipeline (SQL gen + result interpretation), exact prompt text, temperature choices, conversation memory window, WebSocket streaming protocol, and the fallback path |
| [Guardrails](./guardrails.md) | Four independent layers of protection — pre-LLM keyword filter, LLM-level relevance check, SQL syntax validation, and connection-level PRAGMA enforcement |
| [Graph Engine: Algorithms](./graph-engine.md) | TF-IDF search index (formula, normalisation), Louvain community detection, three centrality metrics (degree, betweenness, PageRank), shortest path, and why everything is cached permanently |

---

## System Map

```
JSONL files (19 entity types)
        │
        ▼
   [Ingest at startup]
        │
        ├──────────────────────────► SQLite DB (WAL mode, 23 indexes, 4 views)
        │                                        │
        │                                        ▼
        │                              QueryEngine.process()
        │                              ┌──────────────────────┐
        │                              │ 1. LRU cache check   │
        │                              │ 2. Off-topic filter  │
        │                              │ 3. LLM → SQL         │
        │                              │ 4. validate_sql()    │
        │                              │ 5. execute_query()   │
        │                              │ 6. LLM → narrative   │
        │                              └──────────────────────┘
        │
        └──────────────────────────► NetworkX DiGraph (669 nodes, 4044 edges)
                                                 │
                                                 ├── TF-IDF search index
                                                 ├── Louvain communities (cached)
                                                 ├── Degree/Betweenness/PageRank (cached)
                                                 └── Shortest path (on-demand)

FastAPI (single process, uvicorn)
  ├── POST /api/chat          ← NL → SQL → execute → interpret
  ├── WS   /api/chat/stream   ← same pipeline, streamed tokens
  ├── GET  /api/graph/data    ← full graph JSON (cached)
  ├── GET  /api/graph/node/:id
  ├── GET  /api/graph/search?q=&mode=hybrid|semantic|substring
  ├── GET  /api/graph/path?source=&target=
  ├── GET  /api/graph/communities
  ├── GET  /api/graph/centrality
  ├── GET  /api/graph/analytics
  └── GET  /api/health

React 18 + TypeScript (Vite, deployed to Vercel)
  ├── GraphCanvas     ← react-force-graph-2d / 3d + Three.js
  ├── NodeInspector   ← node properties + neighbor connections
  ├── ChatPanel       ← WebSocket streaming, SQL display, data export
  ├── GraphIntelligence ← Communities tab + Centrality bar chart
  ├── AnalyticsDashboard ← KPI funnel, revenue, top customers
  ├── PathFinder      ← select source + target → highlight path
  └── SearchBar       ← hybrid/semantic/substring node search
```

---

## Tech Stack

**Backend**
- Python 3.11
- FastAPI 0.115.6 + uvicorn
- SQLite (WAL mode, file-based, embedded)
- NetworkX 3.4.2 DiGraph
- Groq `llama-3.3-70b-versatile` via OpenAI SDK
- numpy, scipy (for NetworkX PageRank + Louvain)
- Pydantic v2
- Docker (deployed on Render)

**Frontend**
- React 18 + TypeScript
- Vite 6.4.1
- Tailwind CSS 3.4
- react-force-graph-2d + react-force-graph-3d
- Three.js (3D node rendering)
- lucide-react (icons)
- Deployed on Vercel

---

## What Makes This Different From a Dashboard

Most analytics tools take relational data and put charts on top of it. This tool does two things simultaneously:

1. **NL→SQL→Narrative**: A user types a natural language question, the LLM generates the SQL, the database runs it, and the LLM explains the results in plain English. The user never sees that SQL unless they click to expand it. The entire O2C schema is in the LLM's context, so queries like "trace the full flow for order 740506" or "find incomplete flows missing billing" just work.

2. **Graph topology as a first-class view**: The same data that's in the database is also modelled as a directed graph. You can see which customers are most central to the entire supply chain, which nodes cluster together (Louvain communities), and how entities connect through the O2C causal chain. These questions can't be answered with SQL. They require graph algorithms — and that's exactly what runs here.

The two views are not just cosmetically different. They're architecturally complementary: SQL answers "what happened" and the graph answers "how it's connected."
