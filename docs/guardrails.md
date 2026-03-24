# Guardrails

## Why This Needs Guardrails At All

Open a chat box on a website that runs LLM calls and you've created a public terminal to an AI model connected to your database. People will type weird things. Some will type clever things deliberately. Guardrails are the difference between a demo that breaks in embarrassing ways and one that holds up under actual use.

The guardrails here operate at three independent layers. Each layer can stop a request before the next layer even runs. If any layer stops the request, the LLM Groq API is never called, the database is never queried, and the user gets a clear refusal message.

---

## Layer 1: Pre-LLM Off-Topic Check

Before anything else happens, `is_off_topic()` checks the raw user question against a keyword list:

```python
OFF_TOPIC_SIGNALS = [
    "write a poem", "write a story", "tell me a joke",
    "what is the meaning of life", "who is the president",
    "generate code", "write python", "help me hack",
    "ignore previous instructions", "forget your instructions",
    "you are now", "act as", "role play", "pretend you are",
    "translate to", "what is love", "how to cook", "recipe for",
    "weather today", "news today", "stock price",
]
```

Two things to notice about this list:

**The data questions are obvious** — poems, jokes, cooking recipes, stock prices — these would just confuse the LLM and waste a Groq API call. The check catches them in microseconds with a `str.lower()` substring search.

**The prompt injection signals are the interesting ones** — `"ignore previous instructions"`, `"you are now"`, `"act as"`, `"pretend you are"`. These are the most common patterns in prompt injection attacks where someone tries to override the system prompt identity and get the model to do something other than O2C analytics. Catching them at the keyword level before they ever reach the model is the safest approach — no amount of clever prompt engineering defeats a pre-LLM string match.

Questions shorter than 3 characters are also rejected outright. Empty strings and single-character inputs can cause parsing issues downstream.

The refusal message is standardised:
> I can only answer questions about the Order-to-Cash (O2C) dataset, including sales orders, deliveries, billing documents, journal entries, payments, customers, and products. Please ask a question related to this data.

---

## Layer 2: LLM-Level Relevance Check

If the question passes the keyword filter, it goes to the LLM. The SQL generation system prompt explicitly instructs the model:

> For OFF-TOPIC questions (general knowledge, creative writing, coding, anything not about this O2C data) → set `is_relevant` to `false`.

The model returns either:
```json
{"is_relevant": true, "sql": "...", "explanation": "..."}
```
or:
```json
{"is_relevant": false, "refusal": "polite message"}
```

This catches the questions that are *almost* in-scope but not quite — "what's the average salary of SAP consultants?" or "explain what an O2C process is" — things that the keyword filter would miss but the model correctly identifies as not being answerable from this specific dataset.

Both layers are needed. The keyword filter is instant and injection-proof. The LLM check handles semantic ambiguity. Neither replaces the other.

---

## Layer 3: SQL Validation Before Execution

Even if the LLM correctly generates SQL for a valid O2C question, the SQL is validated by `validate_sql()` before any database connection is opened:

**Must start with SELECT or WITH:**
```python
if not re.match(r"^\s*(SELECT|WITH)\b", normalized, re.IGNORECASE):
    return False, "Only SELECT queries are allowed"
```

**Blocked keywords (case-insensitive):**
```
INSERT UPDATE DELETE DROP ALTER CREATE TRUNCATE
EXEC EXECUTE GRANT REVOKE ATTACH DETACH PRAGMA
REPLACE INTO LOAD
```

The `PRAGMA` block is important — SQLite PRAGMAs can change database behaviour (e.g., `PRAGMA journal_mode=DELETE` would disable WAL) and some can expose sensitive information.

**Multi-statement detection:**
```python
cleaned = re.sub(r"'[^']*'", "", normalized)  # strip string literals first
cleaned = cleaned.rstrip().rstrip(";")
if ";" in cleaned:
    return False, "Multiple statements are not allowed"
```

Stripping string literals before checking for `;` prevents false positives — a valid query like `WHERE status = 'OPEN; see notes'` would incorrectly trip the multi-statement check without the literal stripping.

---

## Layer 4: Connection-Level Enforcement

Even after all software validation, every query connection has:

```python
conn.execute("PRAGMA query_only=ON")
```

This is SQLite's own hardware-level guarantee — no write operation is physically possible on that connection, regardless of what SQL was passed. If somehow the previous three layers all fail and a `DELETE` query reaches execution, SQLite itself refuses it.

This is defence-in-depth: the software guardrails prevent 99.9% of bad queries, and the PRAGMA prevents the remaining 0.1% from causing any harm.

---

## The SQL Repair Path

When a generated SQL query executes and throws a SQLite error, the engine doesn't just fail — it tries once to repair the SQL:

```python
repair_prompt = (
    f"The following SQL query FAILED with a SQLite error.\n\n"
    f"**Original question:** {question}\n"
    f"**Failed SQL:** {failed_sql}\n"
    f"**Error:** {error_msg}\n\n"
    f"Fix the SQL using the CORRECT column and table names from the schema above. "
    f"Pay special attention to: 'material' vs 'product', and which tables have "
    f"'referenceSdDocument'. Return the corrected query in the same JSON format."
)
```

Temperature is `0.0` for repair — maximum determinism. The hint about `material` vs `product` and `referenceSdDocument` covers the two most common schema mistakes the model makes on first generation.

The repaired SQL goes through `validate_sql()` again before execution. There's no retry loop — one repair attempt only. If the repair also fails, the pipeline returns the error cleanly rather than retrying indefinitely.

---

## What These Guardrails Don't Do

They don't prevent a user from asking a very complex query that hits a slow index. They don't rate-limit API calls (that's a Render/infrastructure concern). They don't prevent a user from asking the same question 128 times (they'll get a cache hit every time after the first). They don't validate that the question is sensible — "which customers bought zero products?" is a valid O2C question even though the answer is presumably empty.

Guardrails should block genuine harms. They shouldn't be so aggressive that they block legitimate use cases. The balance here leans toward permissive for valid O2C queries and strict for injection attempts and off-topic use.
