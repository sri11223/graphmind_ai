"""GraphMind AI — Data Ingestion

Reads JSONL files from the SAP O2C dataset and loads them into SQLite.
"""

import json
import logging
from pathlib import Path
from .database import get_connection, get_table_columns

log = logging.getLogger(__name__)

DIR_TO_TABLE = {
    "billing_document_cancellations": "billing_document_cancellations",
    "billing_document_headers": "billing_document_headers",
    "billing_document_items": "billing_document_items",
    "business_partner_addresses": "business_partner_addresses",
    "business_partners": "business_partners",
    "customer_company_assignments": "customer_company_assignments",
    "customer_sales_area_assignments": "customer_sales_area_assignments",
    "journal_entry_items_accounts_receivable": "journal_entries",
    "outbound_delivery_headers": "outbound_delivery_headers",
    "outbound_delivery_items": "outbound_delivery_items",
    "payments_accounts_receivable": "payments",
    "plants": "plants",
    "product_descriptions": "product_descriptions",
    "product_plants": "product_plants",
    "product_storage_locations": "product_storage_locations",
    "products": "products",
    "sales_order_headers": "sales_order_headers",
    "sales_order_items": "sales_order_items",
    "sales_order_schedule_lines": "sales_order_schedule_lines",
}

REAL_COLUMNS = {
    "totalNetAmount", "requestedQuantity", "netAmount", "billingQuantity",
    "actualDeliveryQuantity", "amountInTransactionCurrency",
    "amountInCompanyCodeCurrency", "grossWeight", "netWeight",
    "confdOrderQtyByMatlAvailCheck",
}

BOOL_COLUMNS = {
    "billingDocumentIsCancelled", "businessPartnerIsBlocked",
    "isMarkedForArchiving", "isMarkedForDeletion", "deletionIndicator",
    "completeDeliveryIsDefined", "slsUnlmtdOvrdelivIsAllwd",
    "poBoxIsWithoutNumber",
}


def ingest_all(data_dir: Path) -> dict[str, int]:
    """Ingest every entity folder under *data_dir* into SQLite.

    Returns a mapping of table_name → row count inserted.
    """
    counts: dict[str, int] = {}
    for entity_dir in sorted(data_dir.iterdir()):
        if not entity_dir.is_dir():
            continue
        table_name = DIR_TO_TABLE.get(entity_dir.name)
        if table_name is None:
            log.warning("Unknown entity directory: %s — skipping", entity_dir.name)
            continue

        table_cols = get_table_columns(table_name)
        if not table_cols:
            log.warning("No schema found for table %s — skipping", table_name)
            continue

        records: list[dict] = []
        for jsonl_file in sorted(entity_dir.glob("*.jsonl")):
            with open(jsonl_file, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    raw = json.loads(line)
                    records.append(_transform_record(raw, table_cols))

        if records:
            _bulk_insert(table_name, table_cols, records)
            counts[table_name] = len(records)
            log.info("Ingested %d records into %s", len(records), table_name)

    return counts


def _transform_record(raw: dict, table_cols: list[str]) -> dict:
    """Extract and transform fields that match the table schema."""
    out: dict = {}
    for col in table_cols:
        if col not in raw:
            out[col] = None
            continue
        out[col] = _transform_value(col, raw[col])
    return out


def _transform_value(key: str, value):
    if value is None:
        return None

    # Nested time object → "HH:MM:SS"
    if isinstance(value, dict) and "hours" in value:
        h = int(value.get("hours", 0))
        m = int(value.get("minutes", 0))
        s = int(value.get("seconds", 0))
        return f"{h:02d}:{m:02d}:{s:02d}"

    # Boolean → integer
    if isinstance(value, bool):
        return int(value)

    # Numeric strings for REAL columns
    if key in REAL_COLUMNS and isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    return value


def _bulk_insert(table_name: str, table_cols: list[str], records: list[dict]):
    col_names = ", ".join(f"[{c}]" for c in table_cols)
    placeholders = ", ".join("?" for _ in table_cols)
    sql = f"INSERT OR IGNORE INTO [{table_name}] ({col_names}) VALUES ({placeholders})"

    rows = [tuple(rec.get(c) for c in table_cols) for rec in records]

    with get_connection() as conn:
        conn.executemany(sql, rows)
        conn.commit()
