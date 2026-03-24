"""GraphMind AI — Query Engine

End-to-end pipeline: user question → guardrails → NL-to-SQL → execute → interpret.
"""

import hashlib
import logging
import re
from collections import OrderedDict

from .llm_engine import LLMEngine
from .guardrails import validate_sql, is_off_topic, REFUSAL_MSG
from .database import execute_query

log = logging.getLogger(__name__)

_CACHE_MAX = 128


class QueryEngine:
    def __init__(self, llm: LLMEngine):
        self.llm = llm
        self._cache: OrderedDict[str, dict] = OrderedDict()

    # ------------------------------------------------------------------
    # Query result cache
    # ------------------------------------------------------------------

    @staticmethod
    def _cache_key(question: str) -> str:
        return hashlib.sha256(question.strip().lower().encode()).hexdigest()

    def _get_cached(self, key: str) -> dict | None:
        if key in self._cache:
            self._cache.move_to_end(key)
            log.info("Cache hit for query")
            return self._cache[key]
        return None

    def _put_cache(self, key: str, result: dict) -> None:
        self._cache[key] = result
        if len(self._cache) > _CACHE_MAX:
            self._cache.popitem(last=False)

    def process(
        self, question: str, history: list[dict] | None = None
    ) -> dict:
        """Full query pipeline. Returns dict with answer, sql, data, referenced_nodes."""

        # --- Cache check ---
        cache_key = self._cache_key(question)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        # --- Guardrail 1: Quick off-topic check ---
        if is_off_topic(question):
            return self._refuse()

        # --- Step 1: LLM generates SQL ---
        llm_out = self.llm.generate_sql(question, history)

        if not llm_out.get("is_relevant", True):
            return {
                "answer": llm_out.get("refusal", REFUSAL_MSG),
                "sql": None,
                "data": None,
                "referencedNodes": [],
            }

        sql = llm_out.get("sql", "")
        explanation = llm_out.get("explanation", "")

        # --- Guardrail 2: SQL validation ---
        valid, reason = validate_sql(sql)
        if not valid:
            log.warning("SQL validation failed (%s): %s", reason, sql)
            return {
                "answer": "I couldn't generate a safe query for that question. Please try rephrasing.",
                "sql": sql,
                "data": None,
                "referencedNodes": [],
            }

        # --- Step 2: Execute SQL (with auto-retry on failure) ---
        try:
            results = execute_query(sql)
        except Exception as exc:
            log.warning("SQL execution failed, attempting auto-repair: %s", exc)
            repair_out = self.llm.repair_sql(question, sql, str(exc))
            repaired_sql = repair_out.get("sql", "")
            if not repaired_sql or not repair_out.get("is_relevant", False):
                return {
                    "answer": f"Query execution error: {exc}. Try rephrasing your question.",
                    "sql": sql,
                    "data": None,
                    "referencedNodes": [],
                }
            valid2, reason2 = validate_sql(repaired_sql)
            if not valid2:
                return {
                    "answer": f"Query execution error: {exc}. Try rephrasing your question.",
                    "sql": sql,
                    "data": None,
                    "referencedNodes": [],
                }
            try:
                sql = repaired_sql
                results = execute_query(sql)
                log.info("Auto-repaired SQL succeeded")
            except Exception as exc2:
                log.exception("Repaired SQL also failed: %s", sql)
                return {
                    "answer": f"Query execution error: {exc2}. Try rephrasing your question.",
                    "sql": sql,
                    "data": None,
                    "referencedNodes": [],
                }

        # --- Step 3: LLM interprets results ---
        answer = self.llm.interpret_results(question, sql, results)

        # --- Bonus: extract node IDs referenced in the answer ---
        referenced = self._extract_node_refs(results)

        result = {
            "answer": answer,
            "sql": sql,
            "data": results[:100],
            "referencedNodes": referenced,
        }
        self._put_cache(cache_key, result)
        return result

    # ------------------------------------------------------------------

    @staticmethod
    def _refuse() -> dict:
        return {
            "answer": REFUSAL_MSG,
            "sql": None,
            "data": None,
            "referencedNodes": [],
        }

    @staticmethod
    def _extract_node_refs(results: list[dict]) -> list[str]:
        """Heuristically extract graph node IDs from query result columns."""
        refs: list[str] = []
        id_columns = {
            "salesOrder": "SO",
            "deliveryDocument": "DEL",
            "billingDocument": "BD",
            "accountingDocument": "JE",
            "journalDocument": "JE",
            "paymentDocument": "PAY",
            "clearingAccountingDocument": "PAY",
            "customer": "CUST",
            "soldToParty": "CUST",
            "businessPartner": "CUST",
            "material": "PROD",
            "product": "PROD",
            "plant": "PLANT",
        }
        seen: set[str] = set()
        for row in results[:50]:
            for col, prefix in id_columns.items():
                val = row.get(col)
                if val and str(val).strip():
                    nid = f"{prefix}:{val}"
                    if nid not in seen:
                        seen.add(nid)
                        refs.append(nid)
        return refs
