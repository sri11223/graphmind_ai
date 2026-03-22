"""GraphMind AI — Database Layer

SQLite database with full SAP O2C schema, indexes, and analytical views.
"""

import sqlite3
from pathlib import Path
from contextlib import contextmanager

_db_path: str = ""


def init_db(db_path: Path) -> None:
    global _db_path
    _db_path = str(db_path)
    conn = sqlite3.connect(_db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(_TABLE_SQL)
    conn.executescript(_INDEX_SQL)
    conn.executescript(_VIEW_SQL)
    conn.commit()
    conn.close()


@contextmanager
def get_connection():
    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def execute_query(sql: str) -> list[dict]:
    with get_connection() as conn:
        conn.execute("PRAGMA query_only=ON")
        cursor = conn.execute(sql)
        if cursor.description is None:
            return []
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchmany(1000)
        return [dict(zip(columns, row)) for row in rows]


def get_table_columns(table_name: str) -> list[str]:
    with get_connection() as conn:
        cursor = conn.execute(f"PRAGMA table_info([{table_name}])")
        return [row[1] for row in cursor.fetchall()]


def get_table_stats() -> dict[str, int]:
    tables = [
        "sales_order_headers", "sales_order_items", "sales_order_schedule_lines",
        "outbound_delivery_headers", "outbound_delivery_items",
        "billing_document_headers", "billing_document_items",
        "billing_document_cancellations",
        "journal_entries", "payments",
        "business_partners", "business_partner_addresses",
        "customer_company_assignments", "customer_sales_area_assignments",
        "products", "product_descriptions", "product_plants",
        "product_storage_locations", "plants",
    ]
    stats = {}
    with get_connection() as conn:
        for table in tables:
            cursor = conn.execute(f"SELECT COUNT(*) FROM [{table}]")
            stats[table] = cursor.fetchone()[0]
    return stats


def get_schema_description() -> str:
    return _SCHEMA_DESCRIPTION


# ---------------------------------------------------------------------------
# SQL Definitions
# ---------------------------------------------------------------------------

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sales_order_headers (
    salesOrder TEXT PRIMARY KEY,
    salesOrderType TEXT,
    salesOrganization TEXT,
    distributionChannel TEXT,
    organizationDivision TEXT,
    salesGroup TEXT,
    salesOffice TEXT,
    soldToParty TEXT,
    creationDate TEXT,
    createdByUser TEXT,
    lastChangeDateTime TEXT,
    totalNetAmount REAL,
    overallDeliveryStatus TEXT,
    overallOrdReltdBillgStatus TEXT,
    overallSdDocReferenceStatus TEXT,
    transactionCurrency TEXT,
    pricingDate TEXT,
    requestedDeliveryDate TEXT,
    headerBillingBlockReason TEXT,
    deliveryBlockReason TEXT,
    incotermsClassification TEXT,
    incotermsLocation1 TEXT,
    customerPaymentTerms TEXT,
    totalCreditCheckStatus TEXT
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    salesOrder TEXT NOT NULL,
    salesOrderItem TEXT NOT NULL,
    salesOrderItemCategory TEXT,
    material TEXT,
    requestedQuantity REAL,
    requestedQuantityUnit TEXT,
    transactionCurrency TEXT,
    netAmount REAL,
    materialGroup TEXT,
    productionPlant TEXT,
    storageLocation TEXT,
    salesDocumentRjcnReason TEXT,
    itemBillingBlockReason TEXT,
    PRIMARY KEY (salesOrder, salesOrderItem)
);

CREATE TABLE IF NOT EXISTS sales_order_schedule_lines (
    salesOrder TEXT NOT NULL,
    salesOrderItem TEXT NOT NULL,
    scheduleLine TEXT NOT NULL,
    confirmedDeliveryDate TEXT,
    orderQuantityUnit TEXT,
    confdOrderQtyByMatlAvailCheck REAL,
    PRIMARY KEY (salesOrder, salesOrderItem, scheduleLine)
);

CREATE TABLE IF NOT EXISTS outbound_delivery_headers (
    deliveryDocument TEXT PRIMARY KEY,
    actualGoodsMovementDate TEXT,
    actualGoodsMovementTime TEXT,
    creationDate TEXT,
    creationTime TEXT,
    deliveryBlockReason TEXT,
    hdrGeneralIncompletionStatus TEXT,
    headerBillingBlockReason TEXT,
    lastChangeDate TEXT,
    overallGoodsMovementStatus TEXT,
    overallPickingStatus TEXT,
    overallProofOfDeliveryStatus TEXT,
    shippingPoint TEXT
);

CREATE TABLE IF NOT EXISTS outbound_delivery_items (
    deliveryDocument TEXT NOT NULL,
    deliveryDocumentItem TEXT NOT NULL,
    actualDeliveryQuantity REAL,
    batch TEXT,
    deliveryQuantityUnit TEXT,
    itemBillingBlockReason TEXT,
    lastChangeDate TEXT,
    plant TEXT,
    referenceSdDocument TEXT,
    referenceSdDocumentItem TEXT,
    storageLocation TEXT,
    PRIMARY KEY (deliveryDocument, deliveryDocumentItem)
);

CREATE TABLE IF NOT EXISTS billing_document_headers (
    billingDocument TEXT PRIMARY KEY,
    billingDocumentType TEXT,
    creationDate TEXT,
    creationTime TEXT,
    lastChangeDateTime TEXT,
    billingDocumentDate TEXT,
    billingDocumentIsCancelled INTEGER,
    cancelledBillingDocument TEXT,
    totalNetAmount REAL,
    transactionCurrency TEXT,
    companyCode TEXT,
    fiscalYear TEXT,
    accountingDocument TEXT,
    soldToParty TEXT
);

CREATE TABLE IF NOT EXISTS billing_document_items (
    billingDocument TEXT NOT NULL,
    billingDocumentItem TEXT NOT NULL,
    material TEXT,
    billingQuantity REAL,
    billingQuantityUnit TEXT,
    netAmount REAL,
    transactionCurrency TEXT,
    referenceSdDocument TEXT,
    referenceSdDocumentItem TEXT,
    PRIMARY KEY (billingDocument, billingDocumentItem)
);

CREATE TABLE IF NOT EXISTS billing_document_cancellations (
    billingDocument TEXT PRIMARY KEY,
    billingDocumentType TEXT,
    creationDate TEXT,
    creationTime TEXT,
    lastChangeDateTime TEXT,
    billingDocumentDate TEXT,
    billingDocumentIsCancelled INTEGER,
    cancelledBillingDocument TEXT,
    totalNetAmount REAL,
    transactionCurrency TEXT,
    companyCode TEXT,
    fiscalYear TEXT,
    accountingDocument TEXT,
    soldToParty TEXT
);

CREATE TABLE IF NOT EXISTS journal_entries (
    companyCode TEXT NOT NULL,
    fiscalYear TEXT NOT NULL,
    accountingDocument TEXT NOT NULL,
    accountingDocumentItem TEXT NOT NULL,
    glAccount TEXT,
    referenceDocument TEXT,
    costCenter TEXT,
    profitCenter TEXT,
    transactionCurrency TEXT,
    amountInTransactionCurrency REAL,
    companyCodeCurrency TEXT,
    amountInCompanyCodeCurrency REAL,
    postingDate TEXT,
    documentDate TEXT,
    accountingDocumentType TEXT,
    assignmentReference TEXT,
    lastChangeDateTime TEXT,
    customer TEXT,
    financialAccountType TEXT,
    clearingDate TEXT,
    clearingAccountingDocument TEXT,
    clearingDocFiscalYear TEXT,
    PRIMARY KEY (companyCode, fiscalYear, accountingDocument, accountingDocumentItem)
);

CREATE TABLE IF NOT EXISTS payments (
    companyCode TEXT NOT NULL,
    fiscalYear TEXT NOT NULL,
    accountingDocument TEXT NOT NULL,
    accountingDocumentItem TEXT NOT NULL,
    clearingDate TEXT,
    clearingAccountingDocument TEXT,
    clearingDocFiscalYear TEXT,
    amountInTransactionCurrency REAL,
    transactionCurrency TEXT,
    amountInCompanyCodeCurrency REAL,
    companyCodeCurrency TEXT,
    customer TEXT,
    invoiceReference TEXT,
    invoiceReferenceFiscalYear TEXT,
    salesDocument TEXT,
    salesDocumentItem TEXT,
    postingDate TEXT,
    documentDate TEXT,
    assignmentReference TEXT,
    glAccount TEXT,
    financialAccountType TEXT,
    profitCenter TEXT,
    costCenter TEXT,
    PRIMARY KEY (companyCode, fiscalYear, accountingDocument, accountingDocumentItem)
);

CREATE TABLE IF NOT EXISTS business_partners (
    businessPartner TEXT PRIMARY KEY,
    customer TEXT,
    businessPartnerCategory TEXT,
    businessPartnerFullName TEXT,
    businessPartnerGrouping TEXT,
    businessPartnerName TEXT,
    correspondenceLanguage TEXT,
    createdByUser TEXT,
    creationDate TEXT,
    creationTime TEXT,
    firstName TEXT,
    lastName TEXT,
    formOfAddress TEXT,
    industry TEXT,
    lastChangeDate TEXT,
    organizationBpName1 TEXT,
    organizationBpName2 TEXT,
    businessPartnerIsBlocked INTEGER,
    isMarkedForArchiving INTEGER
);

CREATE TABLE IF NOT EXISTS business_partner_addresses (
    businessPartner TEXT NOT NULL,
    addressId TEXT NOT NULL,
    validityStartDate TEXT,
    validityEndDate TEXT,
    addressUuid TEXT,
    addressTimeZone TEXT,
    cityName TEXT,
    country TEXT,
    postalCode TEXT,
    region TEXT,
    streetName TEXT,
    taxJurisdiction TEXT,
    transportZone TEXT,
    PRIMARY KEY (businessPartner, addressId)
);

CREATE TABLE IF NOT EXISTS customer_company_assignments (
    customer TEXT NOT NULL,
    companyCode TEXT NOT NULL,
    reconciliationAccount TEXT,
    deletionIndicator INTEGER,
    customerAccountGroup TEXT,
    paymentTerms TEXT,
    paymentBlockingReason TEXT,
    paymentMethodsList TEXT,
    PRIMARY KEY (customer, companyCode)
);

CREATE TABLE IF NOT EXISTS customer_sales_area_assignments (
    customer TEXT NOT NULL,
    salesOrganization TEXT NOT NULL,
    distributionChannel TEXT NOT NULL,
    division TEXT NOT NULL,
    billingIsBlockedForCustomer TEXT,
    completeDeliveryIsDefined INTEGER,
    creditControlArea TEXT,
    currency TEXT,
    customerPaymentTerms TEXT,
    deliveryPriority TEXT,
    incotermsClassification TEXT,
    incotermsLocation1 TEXT,
    shippingCondition TEXT,
    exchangeRateType TEXT,
    PRIMARY KEY (customer, salesOrganization, distributionChannel, division)
);

CREATE TABLE IF NOT EXISTS products (
    product TEXT PRIMARY KEY,
    productType TEXT,
    crossPlantStatus TEXT,
    crossPlantStatusValidityDate TEXT,
    creationDate TEXT,
    createdByUser TEXT,
    lastChangeDate TEXT,
    lastChangeDateTime TEXT,
    isMarkedForDeletion INTEGER,
    productOldId TEXT,
    grossWeight REAL,
    weightUnit TEXT,
    netWeight REAL,
    productGroup TEXT,
    baseUnit TEXT,
    division TEXT,
    industrySector TEXT
);

CREATE TABLE IF NOT EXISTS product_descriptions (
    product TEXT NOT NULL,
    language TEXT NOT NULL,
    productDescription TEXT,
    PRIMARY KEY (product, language)
);

CREATE TABLE IF NOT EXISTS product_plants (
    product TEXT NOT NULL,
    plant TEXT NOT NULL,
    countryOfOrigin TEXT,
    regionOfOrigin TEXT,
    productionInvtryManagedLoc TEXT,
    availabilityCheckType TEXT,
    fiscalYearVariant TEXT,
    profitCenter TEXT,
    mrpType TEXT,
    PRIMARY KEY (product, plant)
);

CREATE TABLE IF NOT EXISTS product_storage_locations (
    product TEXT NOT NULL,
    plant TEXT NOT NULL,
    storageLocation TEXT NOT NULL,
    physicalInventoryBlockInd TEXT,
    dateOfLastPostedCntUnRstrcdStk TEXT,
    PRIMARY KEY (product, plant, storageLocation)
);

CREATE TABLE IF NOT EXISTS plants (
    plant TEXT PRIMARY KEY,
    plantName TEXT,
    valuationArea TEXT,
    plantCustomer TEXT,
    plantSupplier TEXT,
    factoryCalendar TEXT,
    defaultPurchasingOrganization TEXT,
    salesOrganization TEXT,
    addressId TEXT,
    plantCategory TEXT,
    distributionChannel TEXT,
    division TEXT,
    language TEXT,
    isMarkedForArchiving INTEGER
);
"""

_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_soh_sold_to ON sales_order_headers(soldToParty);
CREATE INDEX IF NOT EXISTS idx_soh_creation ON sales_order_headers(creationDate);
CREATE INDEX IF NOT EXISTS idx_soh_delivery_status ON sales_order_headers(overallDeliveryStatus);
CREATE INDEX IF NOT EXISTS idx_soi_material ON sales_order_items(material);
CREATE INDEX IF NOT EXISTS idx_soi_plant ON sales_order_items(productionPlant);
CREATE INDEX IF NOT EXISTS idx_odi_ref ON outbound_delivery_items(referenceSdDocument);
CREATE INDEX IF NOT EXISTS idx_odi_plant ON outbound_delivery_items(plant);
CREATE INDEX IF NOT EXISTS idx_bdh_sold_to ON billing_document_headers(soldToParty);
CREATE INDEX IF NOT EXISTS idx_bdh_acct_doc ON billing_document_headers(accountingDocument);
CREATE INDEX IF NOT EXISTS idx_bdh_company ON billing_document_headers(companyCode, fiscalYear);
CREATE INDEX IF NOT EXISTS idx_bdi_ref ON billing_document_items(referenceSdDocument);
CREATE INDEX IF NOT EXISTS idx_bdi_material ON billing_document_items(material);
CREATE INDEX IF NOT EXISTS idx_je_ref ON journal_entries(referenceDocument);
CREATE INDEX IF NOT EXISTS idx_je_customer ON journal_entries(customer);
CREATE INDEX IF NOT EXISTS idx_je_clearing ON journal_entries(clearingAccountingDocument);
CREATE INDEX IF NOT EXISTS idx_je_acct ON journal_entries(companyCode, fiscalYear, accountingDocument);
CREATE INDEX IF NOT EXISTS idx_pay_customer ON payments(customer);
CREATE INDEX IF NOT EXISTS idx_pay_clearing ON payments(clearingAccountingDocument);
CREATE INDEX IF NOT EXISTS idx_pay_invoice ON payments(invoiceReference);
CREATE INDEX IF NOT EXISTS idx_bp_customer ON business_partners(customer);
CREATE INDEX IF NOT EXISTS idx_bpa_bp ON business_partner_addresses(businessPartner);
CREATE INDEX IF NOT EXISTS idx_pd_product ON product_descriptions(product);
CREATE INDEX IF NOT EXISTS idx_pp_plant ON product_plants(plant);
"""

_VIEW_SQL = """
CREATE VIEW IF NOT EXISTS v_o2c_flow AS
SELECT
    soh.salesOrder,
    soh.soldToParty                   AS customer,
    bp.businessPartnerName            AS customerName,
    soh.totalNetAmount                AS orderAmount,
    soh.transactionCurrency           AS orderCurrency,
    soh.creationDate                  AS orderDate,
    soh.overallDeliveryStatus,
    odi.deliveryDocument,
    odh.actualGoodsMovementDate       AS goodsMovementDate,
    odh.overallGoodsMovementStatus,
    bdi.billingDocument,
    bdh.billingDocumentDate,
    bdh.totalNetAmount                AS billingAmount,
    bdh.billingDocumentIsCancelled,
    bdh.accountingDocument            AS journalDocument,
    je.amountInTransactionCurrency    AS journalAmount,
    je.postingDate                    AS journalPostingDate,
    je.clearingAccountingDocument     AS paymentDocument,
    je.clearingDate                   AS paymentDate
FROM sales_order_headers soh
LEFT JOIN business_partners bp
    ON bp.businessPartner = soh.soldToParty
LEFT JOIN outbound_delivery_items odi
    ON odi.referenceSdDocument = soh.salesOrder
LEFT JOIN outbound_delivery_headers odh
    ON odh.deliveryDocument = odi.deliveryDocument
LEFT JOIN billing_document_items bdi
    ON bdi.referenceSdDocument = odi.deliveryDocument
LEFT JOIN billing_document_headers bdh
    ON bdh.billingDocument = bdi.billingDocument
LEFT JOIN journal_entries je
    ON je.referenceDocument = bdh.billingDocument
    AND je.companyCode = bdh.companyCode
    AND je.fiscalYear = bdh.fiscalYear;

CREATE VIEW IF NOT EXISTS v_customer_summary AS
SELECT
    bp.businessPartner,
    bp.businessPartnerName,
    COUNT(DISTINCT soh.salesOrder)       AS totalOrders,
    COALESCE(SUM(soh.totalNetAmount), 0) AS totalOrderValue,
    COUNT(DISTINCT bdh.billingDocument)  AS totalBillingDocs,
    bpa.cityName,
    bpa.region,
    bpa.country
FROM business_partners bp
LEFT JOIN sales_order_headers soh   ON soh.soldToParty   = bp.businessPartner
LEFT JOIN billing_document_headers bdh ON bdh.soldToParty = bp.businessPartner
LEFT JOIN business_partner_addresses bpa ON bpa.businessPartner = bp.businessPartner
GROUP BY bp.businessPartner, bp.businessPartnerName,
         bpa.cityName, bpa.region, bpa.country;

CREATE VIEW IF NOT EXISTS v_product_billing_summary AS
SELECT
    p.product,
    pd.productDescription,
    p.productGroup,
    COUNT(DISTINCT bdi.billingDocument)  AS billingDocCount,
    SUM(bdi.billingQuantity)             AS totalBilledQty,
    SUM(bdi.netAmount)                   AS totalBilledAmount,
    bdi.transactionCurrency
FROM products p
LEFT JOIN product_descriptions pd
    ON pd.product = p.product AND pd.language = 'EN'
LEFT JOIN billing_document_items bdi
    ON bdi.material = p.product
GROUP BY p.product, pd.productDescription, p.productGroup, bdi.transactionCurrency;

CREATE VIEW IF NOT EXISTS v_incomplete_flows AS
SELECT
    soh.salesOrder,
    soh.soldToParty         AS customer,
    soh.totalNetAmount      AS orderAmount,
    soh.overallDeliveryStatus,
    CASE WHEN odi.deliveryDocument IS NOT NULL THEN 1 ELSE 0 END AS hasDelivery,
    CASE WHEN bdi.billingDocument IS NOT NULL  THEN 1 ELSE 0 END AS hasBilling,
    CASE WHEN je.accountingDocument IS NOT NULL THEN 1 ELSE 0 END AS hasJournalEntry,
    CASE WHEN je.clearingAccountingDocument IS NOT NULL
              AND je.clearingAccountingDocument != '' THEN 1 ELSE 0 END AS hasPayment
FROM sales_order_headers soh
LEFT JOIN outbound_delivery_items odi
    ON odi.referenceSdDocument = soh.salesOrder
LEFT JOIN billing_document_items bdi
    ON bdi.referenceSdDocument = odi.deliveryDocument
LEFT JOIN billing_document_headers bdh
    ON bdh.billingDocument = bdi.billingDocument
LEFT JOIN journal_entries je
    ON je.referenceDocument = bdh.billingDocument
    AND je.companyCode = bdh.companyCode
    AND je.fiscalYear = bdh.fiscalYear
GROUP BY soh.salesOrder;
"""

# ---------------------------------------------------------------------------
# Schema Description for LLM Context
# ---------------------------------------------------------------------------

_SCHEMA_DESCRIPTION = """
DATABASE: SAP Order-to-Cash (O2C) Analytics — SQLite

╔═══════════════════════════════════════════════════════════════╗
║  ⚠️  CRITICAL RULES — READ BEFORE GENERATING ANY SQL  ⚠️     ║
╠═══════════════════════════════════════════════════════════════╣
║ 1. The column for product ID in sales_order_items and        ║
║    billing_document_items is called "material" NOT "product". ║
║    Only the products table has a column called "product".     ║
║ 2. referenceSdDocument is on ITEMS tables ONLY:              ║
║    • outbound_delivery_ITEMS.referenceSdDocument (NOT headers)║
║    • billing_document_ITEMS.referenceSdDocument (NOT headers) ║
║    The headers tables do NOT have referenceSdDocument.        ║
║ 3. To link deliveries to orders: JOIN outbound_delivery_items ║
║    odi ON odi.referenceSdDocument = soh.salesOrder            ║
║    Then JOIN outbound_delivery_headers odh                    ║
║    ON odh.deliveryDocument = odi.deliveryDocument             ║
║ 4. To link billing to deliveries: JOIN billing_document_items ║
║    bdi ON bdi.referenceSdDocument = odi.deliveryDocument      ║
║ 5. ALWAYS prefer the pre-built VIEWS for common queries.     ║
║ 6. Use EXACT column names listed below — no guessing.        ║
╚═══════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════
CORE O2C FLOW TABLES
═══════════════════════════════════════════════════

TABLE: sales_order_headers
  PK: salesOrder
  ALL COLUMNS: salesOrder, salesOrderType, salesOrganization, distributionChannel,
    organizationDivision, salesGroup, salesOffice, soldToParty, creationDate,
    createdByUser, lastChangeDateTime, totalNetAmount (REAL), overallDeliveryStatus,
    overallOrdReltdBillgStatus, overallSdDocReferenceStatus, transactionCurrency,
    pricingDate, requestedDeliveryDate, headerBillingBlockReason,
    deliveryBlockReason, incotermsClassification, incotermsLocation1,
    customerPaymentTerms, totalCreditCheckStatus
  Status codes: overallDeliveryStatus "C"=Complete, "A"=Not Yet Processed, "B"=Partial
                overallOrdReltdBillgStatus "C"=Complete, "A"=Not Yet Processed, "B"=Partial

TABLE: sales_order_items
  PK: (salesOrder, salesOrderItem)
  ALL COLUMNS: salesOrder, salesOrderItem, salesOrderItemCategory, material,
    requestedQuantity (REAL), requestedQuantityUnit, transactionCurrency,
    netAmount (REAL), materialGroup, productionPlant, storageLocation,
    salesDocumentRjcnReason, itemBillingBlockReason
  ⚠️ Product/material column is "material" (NOT "product")
  FK: salesOrder → sales_order_headers; material → products.product;
      productionPlant → plants.plant

TABLE: sales_order_schedule_lines
  PK: (salesOrder, salesOrderItem, scheduleLine)
  ALL COLUMNS: salesOrder, salesOrderItem, scheduleLine, confirmedDeliveryDate,
    orderQuantityUnit, confdOrderQtyByMatlAvailCheck (REAL)

TABLE: outbound_delivery_headers
  PK: deliveryDocument
  ALL COLUMNS: deliveryDocument, actualGoodsMovementDate, actualGoodsMovementTime,
    creationDate, creationTime, deliveryBlockReason, hdrGeneralIncompletionStatus,
    headerBillingBlockReason, lastChangeDate, overallGoodsMovementStatus,
    overallPickingStatus, overallProofOfDeliveryStatus, shippingPoint
  ⚠️ This table does NOT have referenceSdDocument — that is on outbound_delivery_ITEMS

TABLE: outbound_delivery_items
  PK: (deliveryDocument, deliveryDocumentItem)
  ALL COLUMNS: deliveryDocument, deliveryDocumentItem, actualDeliveryQuantity (REAL),
    batch, deliveryQuantityUnit, itemBillingBlockReason, lastChangeDate,
    plant, referenceSdDocument, referenceSdDocumentItem, storageLocation
  ⚠️ referenceSdDocument is HERE (links to sales_order_headers.salesOrder)
  FK: deliveryDocument → outbound_delivery_headers;
      referenceSdDocument → sales_order_headers.salesOrder;
      plant → plants.plant

TABLE: billing_document_headers
  PK: billingDocument
  ALL COLUMNS: billingDocument, billingDocumentType, creationDate, creationTime,
    lastChangeDateTime, billingDocumentDate, billingDocumentIsCancelled (0/1),
    cancelledBillingDocument, totalNetAmount (REAL), transactionCurrency,
    companyCode, fiscalYear, accountingDocument, soldToParty
  ⚠️ This table does NOT have referenceSdDocument — that is on billing_document_ITEMS
  FK: soldToParty → business_partners.businessPartner;
      accountingDocument+companyCode+fiscalYear → journal_entries

TABLE: billing_document_items
  PK: (billingDocument, billingDocumentItem)
  ALL COLUMNS: billingDocument, billingDocumentItem, material,
    billingQuantity (REAL), billingQuantityUnit, netAmount (REAL),
    transactionCurrency, referenceSdDocument, referenceSdDocumentItem
  ⚠️ Product column is "material" (NOT "product")
  ⚠️ referenceSdDocument is HERE (links to outbound_delivery_headers.deliveryDocument)
  FK: billingDocument → billing_document_headers;
      referenceSdDocument → outbound_delivery_headers.deliveryDocument;
      material → products.product

TABLE: billing_document_cancellations
  PK: billingDocument
  Same columns as billing_document_headers. For cancelled billing docs only.

TABLE: journal_entries  (accounts receivable journal entry line items)
  PK: (companyCode, fiscalYear, accountingDocument, accountingDocumentItem)
  ALL COLUMNS: companyCode, fiscalYear, accountingDocument, accountingDocumentItem,
    glAccount, referenceDocument, costCenter, profitCenter, transactionCurrency,
    amountInTransactionCurrency (REAL), companyCodeCurrency,
    amountInCompanyCodeCurrency (REAL), postingDate, documentDate,
    accountingDocumentType, assignmentReference, lastChangeDateTime,
    customer, financialAccountType, clearingDate,
    clearingAccountingDocument, clearingDocFiscalYear
  FK: referenceDocument → billing_document_headers.billingDocument;
      customer → business_partners.businessPartner

TABLE: payments  (accounts receivable payment line items)
  PK: (companyCode, fiscalYear, accountingDocument, accountingDocumentItem)
  ALL COLUMNS: companyCode, fiscalYear, accountingDocument, accountingDocumentItem,
    clearingDate, clearingAccountingDocument, clearingDocFiscalYear,
    amountInTransactionCurrency (REAL), transactionCurrency,
    amountInCompanyCodeCurrency (REAL), companyCodeCurrency, customer,
    invoiceReference, invoiceReferenceFiscalYear, salesDocument,
    salesDocumentItem, postingDate, documentDate, assignmentReference,
    glAccount, financialAccountType, profitCenter, costCenter
  FK: customer → business_partners; invoiceReference → billing_document_headers.billingDocument

═══════════════════════════════════════════════════
MASTER DATA TABLES
═══════════════════════════════════════════════════

TABLE: business_partners  (customers)
  PK: businessPartner
  ALL COLUMNS: businessPartner, customer, businessPartnerCategory,
    businessPartnerFullName, businessPartnerGrouping, businessPartnerName,
    correspondenceLanguage, createdByUser, creationDate, creationTime,
    firstName, lastName, formOfAddress, industry, lastChangeDate,
    organizationBpName1, organizationBpName2,
    businessPartnerIsBlocked (0/1), isMarkedForArchiving (0/1)

TABLE: business_partner_addresses
  PK: (businessPartner, addressId)
  ALL COLUMNS: businessPartner, addressId, validityStartDate, validityEndDate,
    addressUuid, addressTimeZone, cityName, country, postalCode, region,
    streetName, taxJurisdiction, transportZone
  FK: businessPartner → business_partners

TABLE: customer_company_assignments
  PK: (customer, companyCode)
  ALL COLUMNS: customer, companyCode, reconciliationAccount, deletionIndicator,
    customerAccountGroup, paymentTerms, paymentBlockingReason, paymentMethodsList

TABLE: customer_sales_area_assignments
  PK: (customer, salesOrganization, distributionChannel, division)
  ALL COLUMNS: customer, salesOrganization, distributionChannel, division,
    billingIsBlockedForCustomer, completeDeliveryIsDefined, creditControlArea,
    currency, customerPaymentTerms, deliveryPriority, incotermsClassification,
    incotermsLocation1, shippingCondition, exchangeRateType

TABLE: products
  PK: product
  ALL COLUMNS: product, productType, crossPlantStatus, crossPlantStatusValidityDate,
    creationDate, createdByUser, lastChangeDate, lastChangeDateTime,
    isMarkedForDeletion (0/1), productOldId, grossWeight (REAL), weightUnit,
    netWeight (REAL), productGroup, baseUnit, division, industrySector

TABLE: product_descriptions
  PK: (product, language)
  ALL COLUMNS: product, language, productDescription
  FK: product → products
  Tip: Filter by language = 'EN' for English descriptions.

TABLE: product_plants
  PK: (product, plant)
  ALL COLUMNS: product, plant, countryOfOrigin, regionOfOrigin,
    productionInvtryManagedLoc, availabilityCheckType, fiscalYearVariant,
    profitCenter, mrpType
  FK: product → products; plant → plants

TABLE: product_storage_locations
  PK: (product, plant, storageLocation)
  ALL COLUMNS: product, plant, storageLocation, physicalInventoryBlockInd,
    dateOfLastPostedCntUnRstrcdStk

TABLE: plants
  PK: plant
  ALL COLUMNS: plant, plantName, valuationArea, plantCustomer, plantSupplier,
    factoryCalendar, defaultPurchasingOrganization, salesOrganization,
    addressId, plantCategory, distributionChannel, division, language,
    isMarkedForArchiving (0/1)

═══════════════════════════════════════════════════
PRE-BUILT VIEWS (prefer these for common queries)
═══════════════════════════════════════════════════

VIEW: v_o2c_flow  — USE THIS for end-to-end flow queries
  Columns: salesOrder, customer, customerName, orderAmount, orderCurrency,
    orderDate, overallDeliveryStatus, deliveryDocument, goodsMovementDate,
    overallGoodsMovementStatus, billingDocument, billingDocumentDate,
    billingAmount, billingDocumentIsCancelled, journalDocument, journalAmount,
    journalPostingDate, paymentDocument, paymentDate

VIEW: v_customer_summary  — USE THIS for customer analytics
  Columns: businessPartner, businessPartnerName, totalOrders, totalOrderValue,
    totalBillingDocs, cityName, region, country

VIEW: v_product_billing_summary  — USE THIS for product analytics
  Columns: product, productDescription, productGroup, billingDocCount,
    totalBilledQty, totalBilledAmount, transactionCurrency

VIEW: v_incomplete_flows  — USE THIS for broken/incomplete flow queries
  Columns: salesOrder, customer, orderAmount, overallDeliveryStatus,
    hasDelivery (0/1), hasBilling (0/1), hasJournalEntry (0/1), hasPayment (0/1)

═══════════════════════════════════════════════════
KEY RELATIONSHIP CHAIN (Order-to-Cash Flow)
═══════════════════════════════════════════════════

  sales_order_headers (salesOrder)
      ↓ sales_order_items (salesOrder, material → products.product)
  outbound_delivery_items (referenceSdDocument = salesOrder)
      ↓ outbound_delivery_headers (deliveryDocument)
  billing_document_items (referenceSdDocument = deliveryDocument, material → products.product)
      ↓ billing_document_headers (billingDocument)
  journal_entries (referenceDocument = billingDocument, companyCode, fiscalYear)
      ↓ clearingAccountingDocument = payment document
  payments (clearingAccountingDocument)

═══════════════════════════════════════════════════
CORRECT JOIN EXAMPLES
═══════════════════════════════════════════════════

-- Orders → Deliveries (MUST go through items table):
FROM sales_order_headers soh
JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
JOIN outbound_delivery_headers odh ON odh.deliveryDocument = odi.deliveryDocument

-- Deliveries → Billing (MUST go through items table):
FROM outbound_delivery_items odi
JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi.deliveryDocument
JOIN billing_document_headers bdh ON bdh.billingDocument = bdi.billingDocument

-- Products in billing: use billing_document_items.material (NOT .product)
-- Products in orders: use sales_order_items.material (NOT .product)
-- To get product name: JOIN products p ON p.product = bdi.material
--                      JOIN product_descriptions pd ON pd.product = p.product AND pd.language = 'EN'

-- Delivered but not billed (USE THE VIEW):
SELECT * FROM v_incomplete_flows WHERE hasDelivery = 1 AND hasBilling = 0
"""
