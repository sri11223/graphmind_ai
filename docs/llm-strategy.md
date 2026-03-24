# LLM Prompting Strategy

## The Model

Groq's `llama-3.3-70b-versatile`. The choice comes down to two things: latency and price. Groq runs inference on custom silicon (LPUs) that delivers 500+ tokens/second. For a chat interface where the user is watching a streaming response, the difference between 50 t/s and 500 t/s is the difference between feeling fast and feeling slow. The "versatile" variant handles both structured JSON output (for SQL generation) and free-text narrative (for result interpretation) without needing separate models.

The client is the standard `openai.OpenAI` SDK pointed at Groq's endpoint:
```python
client = openai.OpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1"
)
```
Groq's API is OpenAI-compatible — this is the entire reason we can swap the base URL and get a different inference backend without touching any other code.

---

## The Two-Stage Pipeline

SQL generation and result interpretation are intentionally split into two separate LLM calls with different system prompts and temperatures.

**Why?** Because these are genuinely different cognitive tasks. SQL generation needs to be deterministic and schema-aware — it benefits from `temperature=0.1` and `response_format={"type":"json_object"}` to reduce hallucination. Result interpretation needs to be conversational and data-driven — it benefits from `temperature=0.3` and free-text output. Mixing these into one call means you're always compromising one for the other.

---

## Stage 1: SQL Generation Prompt

The system prompt sets a hard identity:

> You are **GraphMind AI**, a specialised analytics engine for SAP Order-to-Cash (O2C) data stored in a SQLite database. YOUR ONLY PURPOSE is to help users query and understand this O2C dataset. You must REFUSE every request that is not about this dataset.

Then it injects the full database schema — all 19 table definitions, all column names, all 4 view definitions, all relationship semantics — dynamically via `{schema}`. This is ~200 lines of SQL DDL and commentary that the LLM receives on every call.

The instructions are explicit about common failure modes:

```
• Use 'material' not 'product' in sales_order_items
• For delivery→billing joins, use billing_document_items.referenceSdDocument
  (NOT billing_document_headers)
• Prefer pre-built views when they match the question
• Always LIMIT 100 unless asked for more
• Handle NULLs with COALESCE
• Return ONLY valid JSON — no markdown fences, no extra text
```

The column name hints (`material` vs `product`, `referenceSdDocument` on items not headers) were added after watching the LLM make those specific mistakes on first generation. The SQL repair path (`llm.repair_sql()`) reinforces those same hints with `temperature=0.0`.

Response format is strict JSON:
```json
{"is_relevant": true, "sql": "SELECT ...", "explanation": "one sentence"}
```
or:
```json
{"is_relevant": false, "refusal": "I can only help with O2C data..."}
```

Parsing uses `json.loads()` with a fallback regex `re.search(r"\{.*\}", text, re.DOTALL)` to handle cases where the LLM wraps the JSON in markdown fences despite being told not to.

---

## Stage 2: Result Interpretation Prompt

The system prompt is much shorter and more conversational:

> You are **GraphMind AI**, presenting results from an SAP Order-to-Cash analytics database. Rules: Base your answer ONLY on the provided query results — never invent data. Use markdown formatting: tables for multi-row results, bold for key figures. If results are empty, explain clearly what was searched and that no matches exist. Keep answers concise but complete. When referencing specific entities, mention their IDs. Do NOT repeat the SQL query.

The user prompt bundles up the original question, the SQL that ran, and up to 50 rows of results as formatted JSON. The LLM sees both the intent and the evidence together:

```
**User question:** {question}
**SQL query:** `{sql}`
**Results (N rows, showing first 50):**
```json
[...data...]
```
Provide a clear, data-driven answer.
```

The row cap (50 rows to LLM, 100 rows to frontend) is deliberate. Sending 1000 rows to the LLM would saturate the context window and push us past the token limit. Fifty rows is enough for the LLM to identify patterns and write a meaningful narrative.

---

## Conversation Memory

The chat history is passed entirely to the SQL generation call (system prompt + last 10 messages). This means the LLM can reference earlier questions — "show me the same for last month", "now filter by customer 320000083" — and understand the running context.

Ten messages was chosen over the previous six because longer analytical conversations naturally involve building up context: a user might ask about top customers, then drill into one, then ask about that customer's products, then compare to last quarter. That's four exchanges already at two messages each.

The history is NOT passed to the interpretation call — interpretation is stateless by design. The interpretation prompt has the SQL and results; that's all it needs to answer the current question. Passing history to interpretation would just waste tokens.

---

## The Streaming Path

The WebSocket endpoint (`/api/chat/stream`) implements a status + chunk streaming protocol:

```
{"type": "status",  "status": "Generating SQL…"}
{"type": "sql",     "sql": "...", "explanation": "..."}
{"type": "status",  "status": "Executing query…"}
{"type": "data",    "rowCount": N}
{"type": "status",  "status": "Analyzing results…"}
{"type": "chunk",   "content": "..."}   ← streamed tokens
{"type": "done",    "referencedNodes": [...]}
```

The interpretation call uses `stream=True` on the Groq client, so tokens arrive as they're generated. Each delta is extracted from `chunk.choices[0].delta.content` and immediately forwarded over the WebSocket. The user sees the answer building word by word rather than waiting for the entire response.

The non-streaming `POST /api/chat` endpoint exists for simpler integrations and runs the same pipeline synchronously.

---

## Fallback Without LLM

If interpretation fails entirely, `_fallback_format()` renders a basic Markdown table from raw query results. This means a SQL execution success never produces a blank response — the user always sees their data, even if the prose explanation is missing.

---

## Token Budget

| Call | Model | Temperature | Max context used |
|------|-------|-------------|-----------------|
| SQL generation | llama-3.3-70b-versatile | 0.1 | ~2500 tokens (schema + question + history) |
| SQL repair | llama-3.3-70b-versatile | 0.0 | ~2500 tokens + error message |
| Interpretation | llama-3.3-70b-versatile | 0.3 | ~4000 tokens (50 rows of results) |
| Stream interpretation | llama-3.3-70b-versatile | 0.3 | Same, streamed |

Groq's llama-3.3-70b has a 128k context window. We're well within budget even with large result sets.
