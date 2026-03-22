"""GraphMind AI — LLM Engine

Groq integration via OpenAI-compatible API for:
  - Natural-language → SQL translation
  - Result interpretation (with streaming support)
"""

import json
import logging
import re
from openai import OpenAI
from .config import GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL
from .database import get_schema_description

log = logging.getLogger(__name__)

_SQL_SYSTEM = """You are **GraphMind AI**, a specialised analytics engine for SAP Order-to-Cash (O2C) data stored in a SQLite database.

YOUR ONLY PURPOSE is to help users query and understand this O2C dataset.  You must REFUSE every request that is not about this dataset.

{schema}

═══════════════════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════════════════

1. For RELEVANT questions → generate a valid SQLite SELECT statement that answers the question.
2. For OFF-TOPIC questions (general knowledge, creative writing, coding, anything not about this O2C data) → set is_relevant to false.
3. Rules for SQL generation:
   • Only SELECT or WITH … SELECT.  Never INSERT/UPDATE/DELETE/DROP.
   • Use proper JOINs following the relationship chain documented above.
   • Prefer the pre-built views (v_o2c_flow, v_customer_summary, v_product_billing_summary, v_incomplete_flows) when they match the question.
   • Always LIMIT to 100 unless the user asks for more.
   • Use readable column aliases.
   • Handle NULLs with COALESCE where appropriate.
   • For "trace flow" questions, join through the full chain: sales_order → delivery → billing → journal_entry → payment.
   • For "broken / incomplete flow" questions, use the v_incomplete_flows view.
4. Return ONLY valid JSON — no markdown fences, no extra text.

RESPONSE FORMAT (strict JSON):
If relevant:
{{"is_relevant": true, "sql": "<SQL>", "explanation": "<one-sentence explanation>"}}

If off-topic:
{{"is_relevant": false, "refusal": "<polite refusal message about only handling O2C data>"}}
"""

_INTERPRET_SYSTEM = """You are **GraphMind AI**, presenting results from an SAP Order-to-Cash analytics database.

Rules:
• Base your answer ONLY on the provided query results — never invent data.
• Use markdown formatting: tables for multi-row results, bold for key figures.
• If results are empty, explain clearly what was searched and that no matches exist.
• Keep answers concise but complete.
• When referencing specific entities, mention their IDs (e.g. Sales Order 740506).
• For monetary values include the currency.
• Do NOT repeat the SQL query.
"""


class LLMEngine:
    def __init__(self):
        if not GROQ_API_KEY:
            log.warning("GROQ_API_KEY not set — LLM features will be unavailable")
            self.client = None
            return
        self.client = OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)
        self.model = GROQ_MODEL
        self._schema = get_schema_description()

    # ------------------------------------------------------------------

    def generate_sql(
        self, question: str, history: list[dict] | None = None
    ) -> dict:
        """Translate a natural-language question into SQL.

        Returns dict with keys: is_relevant, sql, explanation  OR  is_relevant, refusal
        """
        if self.client is None:
            return {"is_relevant": False, "refusal": "LLM not configured. Set GROQ_API_KEY."}

        system = _SQL_SYSTEM.format(schema=self._schema)
        messages: list[dict] = [{"role": "system", "content": system}]

        if history:
            for msg in history[-6:]:
                messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": question})

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            text = (response.choices[0].message.content or "").strip()
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                return json.loads(match.group())
            return {"is_relevant": False, "refusal": "Failed to parse LLM response."}
        except Exception as exc:
            log.exception("LLM SQL generation failed")
            return {"is_relevant": False, "refusal": f"LLM error: {exc}"}

    def repair_sql(
        self, question: str, failed_sql: str, error_msg: str
    ) -> dict:
        """Ask the LLM to fix a SQL query that failed execution.

        Sends the original question, the failed SQL, and the SQLite error message
        back to the LLM so it can correct column names / table references.
        """
        if self.client is None:
            return {"is_relevant": False, "refusal": "LLM not configured."}

        system = _SQL_SYSTEM.format(schema=self._schema)
        repair_prompt = (
            f"The following SQL query FAILED with a SQLite error.\n\n"
            f"**Original question:** {question}\n"
            f"**Failed SQL:** {failed_sql}\n"
            f"**Error:** {error_msg}\n\n"
            f"Fix the SQL to use the CORRECT column and table names from the schema above. "
            f"Pay special attention to: 'material' vs 'product', and which tables have 'referenceSdDocument'. "
            f"Return the corrected query in the same JSON format."
        )
        messages: list[dict] = [
            {"role": "system", "content": system},
            {"role": "user", "content": repair_prompt},
        ]
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            text = (response.choices[0].message.content or "").strip()
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                return json.loads(match.group())
            return {"is_relevant": False, "refusal": "Failed to repair SQL."}
        except Exception as exc:
            log.exception("LLM SQL repair failed")
            return {"is_relevant": False, "refusal": f"LLM repair error: {exc}"}

    # ------------------------------------------------------------------

    def interpret_results(
        self, question: str, sql: str, results: list[dict]
    ) -> str:
        """Turn raw SQL results into a natural-language answer."""
        if self.client is None:
            return self._fallback_format(results)

        prompt = self._build_interpret_prompt(question, sql, results)
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": _INTERPRET_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            return (response.choices[0].message.content or "").strip()
        except Exception:
            log.exception("LLM interpretation failed")
            return self._fallback_format(results)

    # ------------------------------------------------------------------

    def stream_interpret(
        self, question: str, sql: str, results: list[dict]
    ):
        """Generator yielding text chunks of the interpretation (for streaming)."""
        if self.client is None:
            yield self._fallback_format(results)
            return

        prompt = self._build_interpret_prompt(question, sql, results)
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": _INTERPRET_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception:
            log.exception("LLM streaming failed")
            yield self._fallback_format(results)

    # ------------------------------------------------------------------

    @staticmethod
    def _build_interpret_prompt(question: str, sql: str, results: list[dict]) -> str:
        display = results[:50]
        return (
            f"**User question:** {question}\n\n"
            f"**SQL query:** `{sql}`\n\n"
            f"**Results ({len(results)} rows, showing first {len(display)}):**\n"
            f"```json\n{json.dumps(display, indent=2, default=str)}\n```\n\n"
            "Provide a clear, data-driven answer."
        )

    @staticmethod
    def _fallback_format(results: list[dict]) -> str:
        if not results:
            return "The query returned no results."
        if len(results) == 1 and len(results[0]) == 1:
            val = list(results[0].values())[0]
            return str(val)
        headers = list(results[0].keys())
        lines = ["| " + " | ".join(headers) + " |"]
        lines.append("| " + " | ".join("---" for _ in headers) + " |")
        for row in results[:30]:
            lines.append("| " + " | ".join(str(row.get(h, "")) for h in headers) + " |")
        if len(results) > 30:
            lines.append(f"\n*…and {len(results) - 30} more rows.*")
        return "\n".join(lines)
