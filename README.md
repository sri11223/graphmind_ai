# GraphMind AI

**Graph-based SAP Order-to-Cash (O2C) analytics with LLM-powered natural language queries.**

GraphMind AI ingests SAP O2C transactional data, builds an in-memory knowledge graph, visualises entity relationships in an interactive 2D/3D force-directed layout, and lets users explore the data through a conversational interface backed by Groq LLM (free).

---

## Live Demo

| Service | URL |
|---------|-----|
| **Frontend** (Vercel) | `https://graphmind-ai-sigma.vercel.app/` |
| **Backend API** (Render) | `https://graphmind-ai.onrender.com` |

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
- **Natural Language Queries** — Ask questions in plain English, get SQL + results + narrative answers.
- **WebSocket Streaming** — Real-time streamed responses with progress indicators.
- **Auto-Retry SQL** — If the LLM generates bad SQL, it auto-detects the error and self-corrects.
- **Query Suggestions** — Pre-built example queries to get started quickly.
- **Dark/Light Theme** — Toggle with persistent preference.
- **Node Inspector** — Click any node to see properties + navigate to neighbors.
- **Graph Search** — Debounced fuzzy search across all 669 nodes.
- **Guardrails** — 3-layer safety: keyword filter, LLM refusal, SQL validator (SELECT only).

---

## Deployment Guide

### Option A: Split Deployment (Recommended)

**Frontend → Vercel** | **Backend → Render** | **Database → SQLite (in container)**

#### Step 1: Deploy Backend on Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo (`sri11223/graphmind_ai`)
4. Render auto-detects `render.yaml`. Settings:
   - **Name**: `graphmind-ai-api`
   - **Runtime**: Docker
   - **Plan**: Free
5. Add environment variable:
   - `GROQ_API_KEY` = your key from [console.groq.com](https://console.groq.com) (free)
6. Click **Deploy**
7. Note your URL: `https://graphmind-ai-api.onrender.com`

> On first startup, the server creates the SQLite DB and ingests all 21,000+ records from JSONL files (~10 seconds).

#### Step 2: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import the same GitHub repo
3. Configure:
   - **Framework**: Vite
   - **Root Directory**: leave as `.` (vercel.json handles it)
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Output Directory**: `frontend/dist`
4. Add environment variable:
   - `VITE_API_URL` = `https://graphmind-ai-api.onrender.com` (your Render URL from Step 1)
5. Click **Deploy**

#### Step 3: Update CORS on Render

Go to your Render service → **Environment** → update:
- `CORS_ORIGINS` = `https://graphmind-ai.vercel.app` (your Vercel URL)

Redeploy the backend.

---

### Option B: Docker (All-in-One)

```bash
docker build -t graphmind-ai .
docker run -p 8000:8000 -e GROQ_API_KEY=your_key_here graphmind-ai
```

Open **http://localhost:8000**

---

### Option C: Local Development

#### Prerequisites
- Python 3.11+
- Node.js 18+
- Groq API key (free — [console.groq.com](https://console.groq.com))

#### Backend

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

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — Vite proxies `/api` to the backend automatically.

---

## Environment Variables

### Backend (Render)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | — | Groq API key ([free](https://console.groq.com)) |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | LLM model |
| `GROQ_BASE_URL` | No | `https://api.groq.com/openai/v1` | API endpoint |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |

### Frontend (Vercel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes (production) | `` (same origin) | Backend URL, e.g. `https://graphmind-ai-api.onrender.com` |

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
