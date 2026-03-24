# Database: Why SQLite and What We Did With It

## The Choice

SQLite gets a bad reputation for "serious" applications. The usual knock is: no server, no concurrent writes, not "production-grade". All of that is true and none of it matters here.

The data is **read-only after ingest**. There are no INSERT/UPDATE/DELETE operations from user queries. The only writes happen once — during startup — when raw JSONL files are parsed and inserted into 19 tables. After that, the database is a query-only artifact. WAL mode handles concurrent reads comfortably. There's no connection pool to manage because SQLite doesn't need one.

The real reason: the data fits in a file. The entire SAP O2C dataset — 19 tables, 21,393 rows — is under 50MB. Spinning up Postgres on Render's free tier means a separate container, connection strings, pg_bouncer concerns, migrations, and the database sleeping after inactivity. SQLite means a file in the container. It's already there when the app starts.

---

## WAL Mode

Set once at init:

```sql
PRAGMA journal_mode=WAL;
```

WAL (Write-Ahead Logging) separates readers from writers at the page level. Even though we're not writing during queries, it matters because the startup ingest (writing) can overlap with the first health check requests (reading). Without WAL, those compete for a single lock. With WAL, reads never block and the ingest completes cleanly.

WAL also makes crash recovery cleaner — if the container dies mid-write, SQLite replays the WAL file rather than leaving a corrupt main database.

---

## The 23 Indexes

Every foreign-key-style join column has an index. This wasn't done mechanically — it was done by tracing the actual query patterns the LLM generates.

The most common O2C query pattern is the flow trace:
```
sales_order_headers → outbound_delivery_items.referenceSdDocument
                    → billing_document_items.referenceSdDocument
                    → journal_entries.referenceDocument
                    → payments.clearingAccountingDocument
```

Each hop in that chain is a join on a column that gets an index:

```sql
CREATE INDEX IF NOT EXISTS idx_odi_ref   ON outbound_delivery_items(referenceSdDocument);
CREATE INDEX IF NOT EXISTS idx_bdi_ref   ON billing_document_items(referenceSdDocument);
CREATE INDEX IF NOT EXISTS idx_je_ref    ON journal_entries(referenceDocument);
CREATE INDEX IF NOT EXISTS idx_pay_clearing ON payments(clearingAccountingDocument);
```

The compound indexes on journal entries and billing documents reflect how those tables are actually queried — almost always filtered by `companyCode + fiscalYear + documentId` together:

```sql
CREATE INDEX IF NOT EXISTS idx_je_acct  ON journal_entries(companyCode, fiscalYear, accountingDocument);
CREATE INDEX IF NOT EXISTS idx_bdh_company ON billing_document_headers(companyCode, fiscalYear);
```

Full index list:
- `idx_soh_sold_to` — soldToParty on sales order headers (customer lookup)
- `idx_soh_creation` — creationDate (date range queries)
- `idx_soh_delivery_status` — overallDeliveryStatus (status filters)
- `idx_soi_material` — material on sales order items (product lookup)
- `idx_soi_plant` — productionPlant on sales order items
- `idx_odi_ref` — referenceSdDocument on delivery items (SO→Delivery join)
- `idx_odi_plant` — plant on delivery items (plant aggregations)
- `idx_bdh_sold_to` — soldToParty on billing headers
- `idx_bdh_acct_doc` — accountingDocument on billing headers
- `idx_bdh_company` — companyCode + fiscalYear compound
- `idx_bdi_ref` — referenceSdDocument on billing items (Delivery→Billing join)
- `idx_bdi_material` — material on billing items
- `idx_je_ref` — referenceDocument on journal entries (Billing→Journal join)
- `idx_je_customer` — customer on journal entries
- `idx_je_clearing` — clearingAccountingDocument on journal entries
- `idx_je_acct` — companyCode + fiscalYear + accountingDocument compound
- `idx_pay_customer` — customer on payments
- `idx_pay_clearing` — clearingAccountingDocument on payments (Journal→Payment join)
- `idx_pay_invoice` — invoiceReference on payments
- `idx_bp_customer` — customer on business_partners
- `idx_bpa_bp` — businessPartner on addresses
- `idx_pd_product` — product on descriptions
- `idx_pp_plant` — plant on product_plants

---

## The Four Views

The LLM is instructed to prefer these views when they match the question. They encode the most common multi-table join patterns so the LLM doesn't have to re-derive them (and potentially get a column name wrong) every time.

**`v_o2c_flow`** — the full O2C chain as a single LEFT JOIN:
```sql
sales_order_headers
  LEFT JOIN business_partners ON ...
  LEFT JOIN outbound_delivery_items ON ...
  LEFT JOIN outbound_delivery_headers ON ...
  LEFT JOIN billing_document_items ON ...
  LEFT JOIN billing_document_headers ON ...
  LEFT JOIN journal_entries ON ...
```
Use this for any "trace flow for order X" question.

**`v_customer_summary`** — per customer: `totalOrders`, `totalOrderValue`, `totalBillingDocs`. Use for "top customers by revenue" without writing aggregate logic.

**`v_product_billing_summary`** — per product: `billingDocCount`, `totalBilledQty`, `totalBilledAmount`. Use for product-level revenue analysis.

**`v_incomplete_flows`** — per sales order: four boolean flags (`hasDelivery`, `hasBilling`, `hasJournalEntry`, `hasPayment`). Any row with a zero flag is a broken O2C flow. Use for exception reporting.

---

## Query Safety

Every query executed by the engine goes through two layers:

1. **`PRAGMA query_only=ON`** set per connection before execution. This is SQLite's own enforcement — no writes are physically possible on that connection regardless of what SQL is passed.

2. **`validate_sql()`** regex check before execution:
   - Must start with `SELECT` or `WITH` (allowing CTEs)
   - Blocks: `INSERT UPDATE DELETE DROP ALTER CREATE TRUNCATE EXEC EXECUTE GRANT REVOKE ATTACH DETACH PRAGMA REPLACE INTO LOAD`
   - Strips string literals before checking for `;` to block multi-statement injections

```python
cleaned = re.sub(r"'[^']*'", "", normalized)  # strip strings first
cleaned = cleaned.rstrip().rstrip(";")
if ";" in cleaned:
    return False, "Multiple statements are not allowed"
```

The string-literal stripping is important — without it, a query like `SELECT '1; DROP TABLE foo'` would be incorrectly flagged as a multi-statement injection.

---

## Row Cap

`execute_query()` fetches with `fetchmany(1000)` — never `fetchall()`. Result sets passed to the LLM are capped at 50 rows in the interpretation prompt. Result sets returned to the frontend are capped at 100 rows. This prevents the LLM context window from being overwhelmed by raw data and prevents the API response from being comically large.
