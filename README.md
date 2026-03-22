# GraphMind AI

**Graph-based SAP Order-to-Cash (O2C) analytics with LLM-powered natural language queries.**

GraphMind AI ingests SAP O2C transactional data, builds an in-memory knowledge graph, visualises entity relationships in an interactive force-directed layout, and lets users explore the data through a conversational interface backed by Google Gemini.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  Force-Graph Canvas  │  │  Chat Panel + Node Inspector     │ │
│  │  (react-force-graph)  │  │  (React-Markdown, Lucide icons) │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API (JSON)
┌──────────────────────────────▼──────────────────────────────────┐
│                       Backend (FastAPI)                          │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────────────────┐  │
│  │  Graph API  │ │  Chat API    │ │  Query Engine             │  │
│  │  /api/graph │ │  /api/chat   │ │  NL → SQL → Execute →    │  │
│  └─────┬──────┘ └──────┬───────┘ │  Interpret → Respond      │  │
│        │               │         └────────┬──────────────────┘  │
│        │               │                  │                     │
│  ┌─────▼──────┐ ┌──────▼────────┐ ┌──────▼───────────────────┐ │
│  │  NetworkX   │ │  Guardrails   │ │  Google Gemini (LLM)     │ │
│  │  DiGraph    │ │  SQL + Topic  │ │  NL-to-SQL + Interpret   │ │
│  └─────┬──────┘ └───────────────┘ └──────────────────────────┘  │
│        │                                                        │
│  ┌─────▼──────────────────────────────────────────────────────┐ │
│  │  SQLite  (19 tables + 4 analytical views + indexes)        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### Database: SQLite

- **Zero setup** — single file, no server process, embedded in the app.
- Comprehensive **schema with typed columns** matching SAP field names (camelCase preserved for traceability).
- **Pre-built analytical views** (`v_o2c_flow`, `v_customer_summary`, `v_product_billing_summary`, `v_incomplete_flows`) for common query patterns.
- WAL mode for read-heavy analytics workloads.

### Graph: NetworkX (in-memory)

- Eight entity types as nodes: **SalesOrder, Delivery, BillingDocument, JournalEntry, Payment, Customer, Product, Plant**.
- Ten relationship types as directed edges following the O2C flow: `SOLD_TO`, `ORDERED_PRODUCT`, `FULFILLED_BY`, `SHIPPED_FROM`, `BILLED_AS`, `INVOICED_TO`, `POSTED_AS`, `CLEARED_BY`, `AVAILABLE_AT`.
- Graph is built once on startup and cached for O(1) serialisation to the frontend.
- Document-level granularity for Journal Entries and Payments (items grouped by accounting document).

### LLM: Google Gemini 2.0 Flash (free tier)

Two-stage prompting strategy:
1. **NL → SQL**: System prompt includes the *complete schema + relationship documentation + pre-built views*. Response constrained to JSON (`response_mime_type: application/json`). Temperature 0.1 for determinism.
2. **Result → Answer**: Separate model call with temperature 0.3 for natural, readable narrative over the raw query results.

### Guardrails (3 layers)

1. **Keyword filter** — instant rejection of clearly off-topic prompts (poems, jokes, general knowledge).
2. **LLM-level refusal** — system prompt instructs the model to return `is_relevant: false` for anything outside O2C scope.
3. **SQL validator** — regex-based allowlist (only `SELECT`/`WITH`), blocks all DDL/DML, prevents multi-statement injection.

### Frontend: React + Tailwind + react-force-graph-2d

- **Canvas-rendered** force-directed layout handles thousands of nodes smoothly.
- Nodes colour-coded by entity type; size proportional to connection degree.
- Click-to-inspect node properties + neighbours; navigate between connected nodes.
- Chat panel with conversation memory, markdown rendering, expandable SQL display.
- Query results automatically highlight referenced nodes on the graph.

---

## O2C Flow Model

```
Customer ← SOLD_TO ← Sales Order → ORDERED_PRODUCT → Product
                          ↓
                    FULFILLED_BY
                          ↓
                      Delivery → SHIPPED_FROM → Plant
                          ↓
                      BILLED_AS
                          ↓
                  Billing Document → INVOICED_TO → Customer
                          ↓
                      POSTED_AS
                          ↓
                   Journal Entry
                          ↓
                     CLEARED_BY
                          ↓
                       Payment
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Google Gemini API key ([get one free](https://ai.google.dev))

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Create .env in project root
cp ../.env.example ../.env
# Edit ../.env → set GEMINI_API_KEY

cd ..
python -m uvicorn backend.app.main:app --reload --port 8000
```

On first run the server will:
1. Create `graphmind.db` (SQLite)
2. Ingest all JSONL files from `sap-o2c-data/`
3. Build the O2C graph (~seconds)

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies `/api` requests to the backend.

### 3. Docker (Production)

```bash
docker build -t graphmind-ai .
docker run -p 8000:8000 -e GEMINI_API_KEY=your_key_here graphmind-ai
```

Open **http://localhost:8000** — the backend serves the built React frontend.

### 4. Deploy to Render.com

1. Push to GitHub
2. On [Render](https://render.com), click **New → Web Service → Connect your repo**
3. Render auto-detects `render.yaml` — just add `GEMINI_API_KEY` as an environment variable
4. Deploy — your live URL will be `https://graphmind-ai.onrender.com`

---

## Example Queries

| Question | What it does |
|----------|-------------|
| *Which products are associated with the highest number of billing documents?* | Uses `v_product_billing_summary` view |
| *Trace the full flow for billing document 91150187* | Joins SO → DEL → BD → JE → PAY |
| *Find sales orders that are delivered but not billed* | Uses `v_incomplete_flows` (hasDelivery=1, hasBilling=0) |
| *What is the total order value per customer?* | Aggregates `sales_order_headers` grouped by `soldToParty` |
| *Show me cancelled billing documents and their original amounts* | Queries `billing_document_cancellations` |

---

## Project Structure

```
├── sap-o2c-data/              # Raw JSONL dataset (19 entity types)
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + startup lifecycle
│   │   ├── config.py          # Environment + paths
│   │   ├── database.py        # SQLite schema, views, indexes
│   │   ├── ingestion.py       # JSONL → SQLite pipeline
│   │   ├── graph_engine.py    # NetworkX graph construction
│   │   ├── llm_engine.py      # Gemini NL→SQL + interpretation
│   │   ├── query_engine.py    # End-to-end query pipeline
│   │   ├── guardrails.py      # SQL validation + topic filtering
│   │   ├── schemas.py         # Pydantic request/response models
│   │   └── routers/
│   │       ├── graph.py       # /api/graph/* endpoints
│   │       └── chat.py        # /api/chat endpoint
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Root layout
│   │   ├── components/
│   │   │   ├── GraphCanvas.tsx    # Force-directed graph
│   │   │   ├── ChatPanel.tsx      # Conversational interface
│   │   │   ├── NodeInspector.tsx  # Node detail overlay
│   │   │   └── SearchBar.tsx      # Debounced graph node search
│   │   ├── services/api.ts   # API client
│   │   └── types/index.ts    # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile                 # Multi-stage Docker build
├── render.yaml                # Render.com deployment config
├── .dockerignore
├── .env.example
├── .gitignore
└── README.md
```

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | FastAPI (Python) | Async, fast, auto-docs, Pydantic validation |
| Database | SQLite | Zero-config, embedded, excellent for read-heavy analytics |
| Graph | NetworkX | Mature graph library, rich traversal algorithms |
| LLM | Google Gemini 2.0 Flash | Free tier, fast, JSON output mode |
| Frontend | React 18 + TypeScript | Type safety, component model |
| Graph Viz | react-force-graph-2d | Canvas-rendered, handles 1000s of nodes |
| Styling | Tailwind CSS | Rapid, consistent, utility-first |
