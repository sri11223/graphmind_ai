# GraphMind AI

**Graph-based SAP Order-to-Cash (O2C) analytics with LLM-powered natural language queries.**

GraphMind AI ingests SAP O2C transactional data, builds an in-memory knowledge graph, visualises entity relationships in an interactive 2D/3D force-directed layout, and lets users explore the data through a conversational interface backed by Groq LLM (free).

---

## Live Demo

| Service | URL |
|---------|-----|
| **Frontend** (Vercel) | `https://graphmind-ai-sigma.vercel.app/` |
| **Backend API** (Render) | `https://graphmind-ai.onrender.com` |
| **API DOCUMENTATION** | `https://graphmind-ai.onrender.com/docs` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Frontend (Vercel)                              │
│  React 18 + TypeScript + Tailwind CSS                            │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐ │
│  │  3D/2D Force Graph   │  │  Chat Panel + Node Inspector      │ │
│  │  (react-force-graph)  │  │  WebSocket streaming + Markdown  │ │
│  └──────────────────────┘  └───────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────────┘
                               │ REST + WebSocket
┌──────────────────────────────▼───────────────────────────────────┐
│                    Backend API (Render)                           │
│  FastAPI + Python 3.11                                           │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────────────────┐  │
│  │  Graph API  │ │  Chat API    │ │  Query Engine              │  │
│  │  /api/graph │ │  /api/chat   │ │  NL → SQL → Execute →     │  │
│  └─────┬──────┘ └──────┬───────┘ │  Interpret → Stream        │  │
│        │               │         └────────┬───────────────────┘  │
│  ┌─────▼──────┐ ┌──────▼────────┐ ┌──────▼──────────────────┐   │
│  │  NetworkX   │ │  Guardrails   │ │  Groq LLM (free)        │  │
│  │  DiGraph    │ │  SQL + Topic  │ │  llama-3.3-70b-versatile │  │
│  └─────┬──────┘ └───────────────┘ └─────────────────────────┘   │
│  ┌─────▼─────────────────────────────────────────────────────┐   │
│  │  SQLite (19 tables + 4 views + indexes, WAL mode)         │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Features

- **3D/2D Interactive Graph** — Orbit, zoom, rotate. Toggle between 3D (Three.js) and 2D (Canvas) modes. Animated link particles, glow effects, fly-to camera.
- **Entity Type Filters** — Click any entity type (SalesOrder, Customer, Product, etc.) to activate/deactivate it. Inactive entities are hidden from the graph view. Click again to show them.
- **Natural Language Queries** — Ask questions in plain English, get SQL + results + narrative answers.
- **WebSocket Streaming** — Real-time streamed responses with progress indicators.
- **Auto-Retry SQL** — If the LLM generates bad SQL, it auto-detects the error and self-corrects.
- **Query Suggestions** — Pre-built example queries to get started quickly.
- **Dark/Light Theme** — Toggle with persistent preference.
- **Node Inspector** — Click any node to see properties + navigate to neighbors.
- **Graph Search** — Debounced fuzzy search across all 669 nodes.
- **Guardrails** — 3-layer safety: keyword filter, LLM refusal, SQL validator (SELECT only).

---

## 🚀 PathFinder: Trace O2C Flows

**Try this first** — Click on any node in the graph (e.g., a Sales Order), then hold **Shift** and click another node (e.g., a Payment). The system highlights the shortest path connecting them, revealing the exact O2C flow. This interactive exploration is the best way to understand how SAP orders flow from creation to payment settlement.

Example: `SalesOrder(740506)` → Delivery → BillingDocument → JournalEntry → Payment (interactive path tracing)

---

## 🔍 Live Graph Search & Filter

**Interactive exploration** — Type any product name, customer ID, or sales order number in the **Search** box at the top. The graph updates in real-time to highlight matching nodes. Click on any node to select it and see its properties in the inspector panel. Inactive entity types are automatically filtered out (toggle entity types in the left panel to show/hide them).

Example: Type `"P-100"` → see all nodes containing "P-100" (products, orders, etc.) highlighted in the graph instantly.

---

## 🎛️ Entity Type Filters

**Control what you see** — Panel on the left shows all 8 entity types (SalesOrder, BillingDocument, Payment, Product, Delivery, Customer, Plant, JournalEntry) with node counts. Click any entity type to toggle it on/off. Inactive entities instantly disappear from the graph. Click again to bring them back. 

**Use case:** Want to see only order and payment flows? Deactivate products and plants to simplify the view.

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- Groq API key (free — [console.groq.com](https://console.groq.com))

### Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux
pip install -r requirements.txt

# Create .env in project root
cp ../.env.example ../.env
# Edit .env → set GROQ_API_KEY

cd ..
python -m uvicorn backend.app.main:app --reload --port 8000
```

API docs available at: **http://localhost:8000/docs**

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — Vite proxies `/api` to the backend automatically.

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

## Example Queries

| Question | What it does |
|----------|-------------|
| *Show me the top 10 customers by order value* | Aggregates `sales_order_headers` by `soldToParty` |
| *Trace the full O2C flow for sales order 740506* | Joins SO → DEL → BD → JE → PAY using `v_o2c_flow` |
| *Find orders delivered but not yet billed* | Uses `v_incomplete_flows` view |
| *Which products have the most billing documents?* | Uses `v_product_billing_summary` view |
| *Show all cancelled billing documents* | Queries `billing_document_cancellations` |
| *What is the total revenue by sales organization?* | Aggregates billing amounts by org |

---

## Project Structure

```
├── sap-o2c-data/              # Raw JSONL dataset (19 entity types)
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + startup lifecycle
│   │   ├── config.py          # Environment variables + paths
│   │   ├── database.py        # SQLite schema, views, indexes
│   │   ├── ingestion.py       # JSONL → SQLite pipeline
│   │   ├── graph_engine.py    # NetworkX graph construction
│   │   ├── llm_engine.py      # Groq NL→SQL + streaming interpretation
│   │   ├── query_engine.py    # End-to-end query pipeline + auto-retry
│   │   ├── guardrails.py      # SQL validation + topic filtering
│   │   ├── schemas.py         # Pydantic request/response models
│   │   └── routers/
│   │       ├── graph.py       # /api/graph/* endpoints
│   │       └── chat.py        # /api/chat REST + WebSocket streaming
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Root layout + 2D/3D toggle
│   │   ├── components/
│   │   │   ├── GraphCanvas.tsx    # 3D/2D force-directed graph
│   │   │   ├── ChatPanel.tsx      # Chat + WebSocket + suggestions
│   │   │   ├── NodeInspector.tsx  # Node detail overlay
│   │   │   ├── SearchBar.tsx      # Debounced graph search
│   │   │   ├── ui/               # Reusable UI components
│   │   │   └── providers/        # Theme + Toast providers
│   │   ├── hooks/             # useWebSocket, useDebounce, etc.
│   │   ├── services/api.ts   # API client
│   │   └── types/index.ts    # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile                 # Backend Docker build for Render
├── render.yaml                # Render.com deployment config
├── vercel.json                # Vercel frontend config
├── .env.example
├── .gitignore
└── README.md
```

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | FastAPI (Python) | Async, fast, WebSocket support, auto-docs |
| Database | SQLite (WAL) | Zero-config, embedded, excellent read perf |
| Graph | NetworkX | Mature graph library, rich algorithms |
| LLM | Groq (llama-3.3-70b-versatile) | Free, fast, OpenAI-compatible |
| Frontend | React 18 + TypeScript | Type safety, component model |
| 3D Graph | react-force-graph-3d + Three.js | WebGL 3D rendering, orbit controls |
| 2D Graph | react-force-graph-2d | Canvas-rendered, lightweight fallback |
| Styling | Tailwind CSS 3 | Utility-first, dark mode support |
| Frontend Hosting | Vercel | Free, fast CDN, zero-config |
| Backend Hosting | Render | Free, Docker support, auto-deploy |

---

## Architecture & Design Documentation

For comprehensive details on design trade-offs, architecture decisions, and implementation strategies, see:

- **[Architecture Overview](docs/architecture.md)** — System design, high-level flow, request/response pipeline
- **[Database Design](docs/database.md)** — Schema, indexes, views, query optimization, WAL mode
- **[Graph Engine](docs/graph-engine.md)** — Entity types, edge relationships, centrality algorithms, search strategies
- **[LLM Strategy](docs/llm-strategy.md)** — Two-stage NL→SQL pipeline, temperature tuning, result interpretation
- **[Guardrails & Security](docs/guardrails.md)** — SQL validation, input sanitization, rate limiting, attack prevention
