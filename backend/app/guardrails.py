"""GraphMind AI — Guardrails

SQL validation and off-topic detection to keep the system safe and focused.
"""

import re

FORBIDDEN_SQL = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|"
    r"GRANT|REVOKE|ATTACH|DETACH|PRAGMA|REPLACE\s+INTO|LOAD)\b",
    re.IGNORECASE,
)

OFF_TOPIC_SIGNALS = [
    "write a poem", "write a story", "tell me a joke", "what is the meaning of life",
    "who is the president", "generate code", "write python", "help me hack",
    "ignore previous instructions", "forget your instructions",
    "you are now", "act as", "role play", "pretend you are",
    "translate to", "what is love", "how to cook", "recipe for",
    "weather today", "news today", "stock price",
]

REFUSAL_MSG = (
    "I can only answer questions about the Order-to-Cash (O2C) dataset, "
    "including sales orders, deliveries, billing documents, journal entries, "
    "payments, customers, and products. Please ask a question related to this data."
)


def validate_sql(sql: str) -> tuple[bool, str]:
    """Return (is_valid, reason). Only SELECT / WITH queries are allowed."""
    if not sql or not sql.strip():
        return False, "Empty SQL"

    normalized = sql.strip()

    # Must start with SELECT or WITH (CTEs)
    if not re.match(r"^\s*(SELECT|WITH)\b", normalized, re.IGNORECASE):
        return False, "Only SELECT queries are allowed"

    # Check for forbidden keywords
    match = FORBIDDEN_SQL.search(normalized)
    if match:
        return False, f"Forbidden keyword: {match.group()}"

    # Block multiple statements (ignore trailing semicolons and string literals)
    cleaned = re.sub(r"'[^']*'", "", normalized)  # strip string literals
    cleaned = cleaned.rstrip().rstrip(";")
    if ";" in cleaned:
        return False, "Multiple statements are not allowed"

    return True, "OK"


def is_off_topic(question: str) -> bool:
    """Quick keyword-level check for clearly off-topic prompts."""
    q = question.lower().strip()
    if len(q) < 3:
        return True
    for signal in OFF_TOPIC_SIGNALS:
        if signal in q:
            return True
    return False
