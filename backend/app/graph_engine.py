"""GraphMind AI — Graph Engine

Builds an in-memory NetworkX directed graph from the SQLite data and
serialises it for the frontend (react-force-graph-2d compatible JSON).
"""

import logging
import math
import re
from collections import Counter, defaultdict

import networkx as nx
from networkx.algorithms.community import louvain_communities

from .database import get_connection

log = logging.getLogger(__name__)

# Node type → hex colour (matches frontend palette)
PALETTE = {
    "SalesOrder":      "#3B82F6",
    "Delivery":        "#10B981",
    "BillingDocument": "#F59E0B",
    "JournalEntry":    "#8B5CF6",
    "Payment":         "#EC4899",
    "Customer":        "#EF4444",
    "Product":         "#06B6D4",
    "Plant":           "#6B7280",
}


class GraphEngine:
    def __init__(self):
        self.graph = nx.DiGraph()
        self._cache: dict | None = None
        self._tfidf_index: dict | None = None
        self._communities_cache: dict | None = None
        self._centrality_cache: dict | None = None

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def build(self) -> None:
        self.graph.clear()
        self._cache = None
        with get_connection() as conn:
            self._add_sales_orders(conn)
            self._add_deliveries(conn)
            self._add_billing_documents(conn)
            self._add_journal_entries(conn)
            self._add_payments(conn)
            self._add_customers(conn)
            self._add_products(conn)
            self._add_plants(conn)
            self._build_edges(conn)
        log.info(
            "Graph built: %d nodes, %d edges",
            self.graph.number_of_nodes(),
            self.graph.number_of_edges(),
        )

    # ------------------------------------------------------------------
    # Node builders
    # ------------------------------------------------------------------

    def _add_sales_orders(self, conn):
        for r in conn.execute(
            "SELECT salesOrder, salesOrderType, soldToParty, creationDate, "
            "totalNetAmount, transactionCurrency, overallDeliveryStatus "
            "FROM sales_order_headers"
        ):
            d = dict(r)
            self.graph.add_node(
                f"SO:{d['salesOrder']}",
                type="SalesOrder",
                label=f"SO {d['salesOrder']}",
                color=PALETTE["SalesOrder"],
                **d,
            )

    def _add_deliveries(self, conn):
        for r in conn.execute(
            "SELECT deliveryDocument, creationDate, shippingPoint, "
            "overallGoodsMovementStatus, overallPickingStatus "
            "FROM outbound_delivery_headers"
        ):
            d = dict(r)
            self.graph.add_node(
                f"DEL:{d['deliveryDocument']}",
                type="Delivery",
                label=f"DEL {d['deliveryDocument']}",
                color=PALETTE["Delivery"],
                **d,
            )

    def _add_billing_documents(self, conn):
        for r in conn.execute(
            "SELECT billingDocument, billingDocumentType, billingDocumentDate, "
            "totalNetAmount, transactionCurrency, billingDocumentIsCancelled, "
            "soldToParty, accountingDocument, companyCode, fiscalYear "
            "FROM billing_document_headers"
        ):
            d = dict(r)
            self.graph.add_node(
                f"BD:{d['billingDocument']}",
                type="BillingDocument",
                label=f"BD {d['billingDocument']}",
                color=PALETTE["BillingDocument"],
                **d,
            )

    def _add_journal_entries(self, conn):
        # Group by (companyCode, fiscalYear, accountingDocument) — one node per document
        seen: set[str] = set()
        for r in conn.execute(
            "SELECT companyCode, fiscalYear, accountingDocument, "
            "referenceDocument, customer, postingDate, "
            "accountingDocumentType, "
            "SUM(amountInTransactionCurrency) AS totalAmount, "
            "transactionCurrency, clearingAccountingDocument, clearingDate "
            "FROM journal_entries "
            "GROUP BY companyCode, fiscalYear, accountingDocument"
        ):
            d = dict(r)
            nid = f"JE:{d['accountingDocument']}"
            if nid in seen:
                continue
            seen.add(nid)
            self.graph.add_node(
                nid,
                type="JournalEntry",
                label=f"JE {d['accountingDocument']}",
                color=PALETTE["JournalEntry"],
                **d,
            )

    def _add_payments(self, conn):
        # Distinct clearing documents from journal entries
        seen: set[str] = set()
        for r in conn.execute(
            "SELECT clearingAccountingDocument, clearingDate, "
            "clearingDocFiscalYear, companyCode, customer, "
            "SUM(amountInTransactionCurrency) AS totalAmount, "
            "transactionCurrency "
            "FROM journal_entries "
            "WHERE clearingAccountingDocument IS NOT NULL "
            "AND clearingAccountingDocument != '' "
            "GROUP BY clearingAccountingDocument"
        ):
            d = dict(r)
            nid = f"PAY:{d['clearingAccountingDocument']}"
            if nid in seen:
                continue
            seen.add(nid)
            self.graph.add_node(
                nid,
                type="Payment",
                label=f"PAY {d['clearingAccountingDocument']}",
                color=PALETTE["Payment"],
                **d,
            )

    def _add_customers(self, conn):
        for r in conn.execute(
            "SELECT bp.businessPartner, bp.businessPartnerName, "
            "bp.businessPartnerCategory, bp.industry, bp.creationDate, "
            "bpa.cityName, bpa.region, bpa.country "
            "FROM business_partners bp "
            "LEFT JOIN business_partner_addresses bpa "
            "ON bpa.businessPartner = bp.businessPartner"
        ):
            d = dict(r)
            self.graph.add_node(
                f"CUST:{d['businessPartner']}",
                type="Customer",
                label=d["businessPartnerName"] or d["businessPartner"],
                color=PALETTE["Customer"],
                **d,
            )

    def _add_products(self, conn):
        for r in conn.execute(
            "SELECT p.product, p.productType, p.productGroup, p.baseUnit, "
            "pd.productDescription "
            "FROM products p "
            "LEFT JOIN product_descriptions pd "
            "ON pd.product = p.product AND pd.language = 'EN'"
        ):
            d = dict(r)
            self.graph.add_node(
                f"PROD:{d['product']}",
                type="Product",
                label=d["productDescription"] or d["product"],
                color=PALETTE["Product"],
                **d,
            )

    def _add_plants(self, conn):
        for r in conn.execute("SELECT plant, plantName FROM plants"):
            d = dict(r)
            self.graph.add_node(
                f"PLANT:{d['plant']}",
                type="Plant",
                label=d["plantName"] or d["plant"],
                color=PALETTE["Plant"],
                **d,
            )

    # ------------------------------------------------------------------
    # Edge builders
    # ------------------------------------------------------------------

    def _build_edges(self, conn):
        # SO → Customer (SOLD_TO)
        for r in conn.execute(
            "SELECT salesOrder, soldToParty FROM sales_order_headers "
            "WHERE soldToParty IS NOT NULL AND soldToParty != ''"
        ):
            src, tgt = f"SO:{r['salesOrder']}", f"CUST:{r['soldToParty']}"
            if self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="SOLD_TO")

        # SO → Product (via sales_order_items)
        for r in conn.execute(
            "SELECT DISTINCT salesOrder, material FROM sales_order_items "
            "WHERE material IS NOT NULL AND material != ''"
        ):
            src, tgt = f"SO:{r['salesOrder']}", f"PROD:{r['material']}"
            if self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="ORDERED_PRODUCT")

        # SO → Delivery (via delivery_items.referenceSdDocument)
        for r in conn.execute(
            "SELECT DISTINCT referenceSdDocument, deliveryDocument "
            "FROM outbound_delivery_items "
            "WHERE referenceSdDocument IS NOT NULL AND referenceSdDocument != ''"
        ):
            src = f"SO:{r['referenceSdDocument']}"
            tgt = f"DEL:{r['deliveryDocument']}"
            if self.graph.has_node(src) and self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="FULFILLED_BY")

        # Delivery → Plant (via delivery items)
        for r in conn.execute(
            "SELECT DISTINCT deliveryDocument, plant FROM outbound_delivery_items "
            "WHERE plant IS NOT NULL AND plant != ''"
        ):
            src, tgt = f"DEL:{r['deliveryDocument']}", f"PLANT:{r['plant']}"
            if self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="SHIPPED_FROM")

        # Delivery → BillingDocument (via billing_items.referenceSdDocument)
        for r in conn.execute(
            "SELECT DISTINCT referenceSdDocument, billingDocument "
            "FROM billing_document_items "
            "WHERE referenceSdDocument IS NOT NULL AND referenceSdDocument != ''"
        ):
            src = f"DEL:{r['referenceSdDocument']}"
            tgt = f"BD:{r['billingDocument']}"
            if self.graph.has_node(src) and self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="BILLED_AS")

        # BillingDocument → Customer (INVOICED_TO)
        for r in conn.execute(
            "SELECT billingDocument, soldToParty FROM billing_document_headers "
            "WHERE soldToParty IS NOT NULL AND soldToParty != ''"
        ):
            src, tgt = f"BD:{r['billingDocument']}", f"CUST:{r['soldToParty']}"
            if self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="INVOICED_TO")

        # BillingDocument → JournalEntry (via accountingDocument)
        for r in conn.execute(
            "SELECT DISTINCT bdh.billingDocument, je.accountingDocument "
            "FROM billing_document_headers bdh "
            "JOIN journal_entries je ON je.referenceDocument = bdh.billingDocument"
        ):
            src = f"BD:{r['billingDocument']}"
            tgt = f"JE:{r['accountingDocument']}"
            if self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="POSTED_AS")

        # JournalEntry → Payment (via clearingAccountingDocument)
        for r in conn.execute(
            "SELECT DISTINCT accountingDocument, clearingAccountingDocument "
            "FROM journal_entries "
            "WHERE clearingAccountingDocument IS NOT NULL "
            "AND clearingAccountingDocument != ''"
        ):
            src = f"JE:{r['accountingDocument']}"
            tgt = f"PAY:{r['clearingAccountingDocument']}"
            if self.graph.has_node(src) and self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="CLEARED_BY")

        # Product → Plant (via product_plants)
        for r in conn.execute(
            "SELECT DISTINCT product, plant FROM product_plants"
        ):
            src, tgt = f"PROD:{r['product']}", f"PLANT:{r['plant']}"
            if self.graph.has_node(src) and self.graph.has_node(tgt):
                self.graph.add_edge(src, tgt, type="AVAILABLE_AT")

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def get_full_graph(self) -> dict:
        if self._cache is not None:
            return self._cache
        nodes = []
        for nid, attrs in self.graph.nodes(data=True):
            nodes.append({
                "id": nid,
                "type": attrs.get("type", ""),
                "label": attrs.get("label", nid),
                "color": attrs.get("color", "#999"),
                "val": max(1, self.graph.degree(nid)),  # size
            })
        links = []
        for src, tgt, attrs in self.graph.edges(data=True):
            links.append({
                "source": src,
                "target": tgt,
                "type": attrs.get("type", ""),
            })
        self._cache = {"nodes": nodes, "links": links}
        return self._cache

    def get_node_detail(self, node_id: str) -> dict | None:
        if not self.graph.has_node(node_id):
            return None
        attrs = dict(self.graph.nodes[node_id])
        neighbors = []
        for nbr in self.graph.predecessors(node_id):
            edge_data = self.graph.edges[nbr, node_id]
            neighbors.append({
                "id": nbr,
                "type": self.graph.nodes[nbr].get("type", ""),
                "label": self.graph.nodes[nbr].get("label", nbr),
                "edgeType": edge_data.get("type", ""),
                "direction": "incoming",
            })
        for nbr in self.graph.successors(node_id):
            edge_data = self.graph.edges[node_id, nbr]
            neighbors.append({
                "id": nbr,
                "type": self.graph.nodes[nbr].get("type", ""),
                "label": self.graph.nodes[nbr].get("label", nbr),
                "edgeType": edge_data.get("type", ""),
                "direction": "outgoing",
            })
        return {"id": node_id, "properties": attrs, "neighbors": neighbors}

    def search_nodes(self, query: str, limit: int = 20) -> list[dict]:
        q = query.lower()
        results = []
        for nid, attrs in self.graph.nodes(data=True):
            label = str(attrs.get("label", "")).lower()
            if q in nid.lower() or q in label:
                results.append({
                    "id": nid,
                    "type": attrs.get("type", ""),
                    "label": attrs.get("label", nid),
                    "color": attrs.get("color", "#999"),
                })
                if len(results) >= limit:
                    break
        return results

    def get_stats(self) -> dict:
        type_counts: dict[str, int] = defaultdict(int)
        for _, attrs in self.graph.nodes(data=True):
            type_counts[attrs.get("type", "Unknown")] += 1
        edge_type_counts: dict[str, int] = defaultdict(int)
        for _, _, attrs in self.graph.edges(data=True):
            edge_type_counts[attrs.get("type", "Unknown")] += 1
        return {
            "totalNodes": self.graph.number_of_nodes(),
            "totalEdges": self.graph.number_of_edges(),
            "nodesByType": dict(type_counts),
            "edgesByType": dict(edge_type_counts),
        }

    # ------------------------------------------------------------------
    # Path finder — shortest path between two nodes
    # ------------------------------------------------------------------

    def find_path(self, source_id: str, target_id: str) -> dict | None:
        if not self.graph.has_node(source_id) or not self.graph.has_node(target_id):
            return None
        try:
            path = nx.shortest_path(self.graph.to_undirected(), source_id, target_id)
        except nx.NetworkXNoPath:
            return None
        nodes = []
        for nid in path:
            attrs = self.graph.nodes[nid]
            nodes.append({
                "id": nid,
                "type": attrs.get("type", ""),
                "label": attrs.get("label", nid),
                "color": attrs.get("color", "#999"),
            })
        edges = []
        for i in range(len(path) - 1):
            a, b = path[i], path[i + 1]
            if self.graph.has_edge(a, b):
                edges.append({"source": a, "target": b, "type": self.graph.edges[a, b].get("type", "")})
            elif self.graph.has_edge(b, a):
                edges.append({"source": b, "target": a, "type": self.graph.edges[b, a].get("type", "")})
        return {"path": nodes, "edges": edges, "length": len(path) - 1}

    # ------------------------------------------------------------------
    # Analytics — KPI dashboard data
    # ------------------------------------------------------------------

    def get_analytics(self) -> dict:
        from .database import get_connection
        with get_connection() as conn:
            # O2C flow completion
            total_orders = conn.execute("SELECT COUNT(*) FROM sales_order_headers").fetchone()[0]
            delivered = conn.execute(
                "SELECT COUNT(DISTINCT soi.salesOrder) FROM sales_order_items soi "
                "JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soi.salesOrder"
            ).fetchone()[0]
            billed = conn.execute(
                "SELECT COUNT(DISTINCT odi.deliveryDocument) FROM outbound_delivery_items odi "
                "JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi.deliveryDocument"
            ).fetchone()[0]
            paid = conn.execute(
                "SELECT COUNT(DISTINCT accountingDocument) FROM journal_entries "
                "WHERE clearingAccountingDocument IS NOT NULL AND clearingAccountingDocument != ''"
            ).fetchone()[0]

            # Revenue
            total_revenue = conn.execute(
                "SELECT COALESCE(SUM(totalNetAmount), 0) FROM billing_document_headers "
                "WHERE billingDocumentIsCancelled = ''"
            ).fetchone()[0]

            # Top 5 customers
            top_customers = [dict(r) for r in conn.execute(
                "SELECT bp.businessPartnerName AS name, "
                "COUNT(DISTINCT soh.salesOrder) AS orders, "
                "COALESCE(SUM(soh.totalNetAmount), 0) AS revenue "
                "FROM sales_order_headers soh "
                "JOIN business_partners bp ON bp.businessPartner = soh.soldToParty "
                "GROUP BY bp.businessPartner ORDER BY revenue DESC LIMIT 5"
            )]

            # Top 5 products
            top_products = [dict(r) for r in conn.execute(
                "SELECT COALESCE(pd.productDescription, p.product) AS name, "
                "COUNT(DISTINCT soi.salesOrder) AS orders "
                "FROM sales_order_items soi "
                "JOIN products p ON p.product = soi.material "
                "LEFT JOIN product_descriptions pd ON pd.product = p.product AND pd.language = 'EN' "
                "GROUP BY soi.material ORDER BY orders DESC LIMIT 5"
            )]

            # Order status distribution
            status_dist = [dict(r) for r in conn.execute(
                "SELECT overallDeliveryStatus AS status, COUNT(*) AS count "
                "FROM sales_order_headers GROUP BY overallDeliveryStatus"
            )]

            # Monthly revenue trend (by billing date)
            monthly_trend = [dict(r) for r in conn.execute(
                "SELECT SUBSTR(billingDocumentDate, 1, 7) AS month, "
                "COALESCE(SUM(totalNetAmount), 0) AS revenue, "
                "COUNT(*) AS invoices "
                "FROM billing_document_headers "
                "WHERE billingDocumentIsCancelled = '' AND billingDocumentDate != '' "
                "GROUP BY month ORDER BY month"
            )]

        return {
            "funnel": {
                "orders": total_orders,
                "delivered": delivered,
                "billed": billed,
                "paid": paid,
            },
            "totalRevenue": float(total_revenue),
            "topCustomers": top_customers,
            "topProducts": top_products,
            "statusDistribution": status_dist,
            "monthlyTrend": monthly_trend,
        }

    # ------------------------------------------------------------------
    # TF-IDF Semantic Search
    # ------------------------------------------------------------------

    def _build_search_index(self):
        """Build TF-IDF inverted index over all node properties."""
        docs: dict[str, str] = {}
        for nid, attrs in self.graph.nodes(data=True):
            parts = [str(v) for k, v in attrs.items() if v and k not in ("color", "x", "y")]
            docs[nid] = " ".join(parts).lower()

        n_docs = len(docs)
        if n_docs == 0:
            self._tfidf_index = {"idf": {}, "vectors": {}, "docs": {}}
            return

        # Tokenize
        tokenized: dict[str, Counter] = {}
        doc_freq: Counter = Counter()
        for nid, text in docs.items():
            tokens = re.findall(r"\w+", text)
            tokenized[nid] = Counter(tokens)
            doc_freq.update(set(tokens))

        # IDF
        idf = {t: math.log((n_docs + 1) / (df + 1)) + 1 for t, df in doc_freq.items()}

        # TF-IDF vectors (normalised)
        vectors: dict[str, dict[str, float]] = {}
        for nid, tf in tokenized.items():
            vec = {t: c * idf.get(t, 1.0) for t, c in tf.items()}
            norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
            vectors[nid] = {t: v / norm for t, v in vec.items()}

        self._tfidf_index = {"idf": idf, "vectors": vectors, "docs": docs}
        log.info("TF-IDF search index built: %d documents, %d terms", n_docs, len(idf))

    def semantic_search(self, query: str, limit: int = 20) -> list[dict]:
        """Search nodes using TF-IDF cosine similarity."""
        if self._tfidf_index is None:
            self._build_search_index()

        idf = self._tfidf_index["idf"]
        vectors = self._tfidf_index["vectors"]

        # Build query vector
        q_tokens = Counter(re.findall(r"\w+", query.lower()))
        q_vec = {t: c * idf.get(t, 1.0) for t, c in q_tokens.items()}
        q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0
        q_vec = {t: v / q_norm for t, v in q_vec.items()}

        # Cosine similarity against all docs
        scores: list[tuple[str, float]] = []
        for nid, doc_vec in vectors.items():
            sim = sum(q_vec.get(t, 0) * doc_vec.get(t, 0) for t in q_vec)
            if sim > 0.01:
                scores.append((nid, sim))

        scores.sort(key=lambda x: x[1], reverse=True)

        results = []
        for nid, score in scores[:limit]:
            attrs = self.graph.nodes[nid]
            results.append({
                "id": nid,
                "type": attrs.get("type", ""),
                "label": attrs.get("label", nid),
                "color": attrs.get("color", "#999"),
                "score": round(score, 4),
            })
        return results

    def hybrid_search(self, query: str, limit: int = 20) -> list[dict]:
        """Combine substring matching + TF-IDF semantic for hybrid results."""
        combined: dict[str, float] = {}
        q = query.lower()

        # Substring matches get a strong boost
        for nid, attrs in self.graph.nodes(data=True):
            label = str(attrs.get("label", "")).lower()
            nid_lower = nid.lower()
            if q in nid_lower or q in label:
                # Exact substring match → high score
                combined[nid] = 2.0 if q == nid_lower or q == label else 1.5

        # Semantic matches
        for item in self.semantic_search(query, limit=limit * 2):
            nid = item["id"]
            combined[nid] = combined.get(nid, 0) + item["score"]

        ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)[:limit]
        results = []
        for nid, score in ranked:
            attrs = self.graph.nodes[nid]
            results.append({
                "id": nid,
                "type": attrs.get("type", ""),
                "label": attrs.get("label", nid),
                "color": attrs.get("color", "#999"),
                "score": round(score, 4),
            })
        return results

    # ------------------------------------------------------------------
    # Community Detection (Louvain algorithm)
    # ------------------------------------------------------------------

    def get_communities(self) -> dict:
        """Detect communities using the Louvain algorithm."""
        if self._communities_cache is not None:
            return self._communities_cache

        undirected = self.graph.to_undirected()
        communities = louvain_communities(undirected, seed=42)

        assignments: dict[str, int] = {}
        clusters: list[dict] = []
        for i, community in enumerate(sorted(communities, key=len, reverse=True)):
            for node_id in community:
                assignments[node_id] = i
            types_in_cluster: dict[str, int] = defaultdict(int)
            for nid in community:
                ntype = self.graph.nodes[nid].get("type", "Unknown")
                types_in_cluster[ntype] += 1
            clusters.append({
                "clusterId": i,
                "size": len(community),
                "nodeTypes": dict(types_in_cluster),
                "sampleNodes": sorted(community)[:10],
            })

        self._communities_cache = {
            "totalClusters": len(communities),
            "assignments": assignments,
            "clusters": clusters,
        }
        log.info("Detected %d communities via Louvain", len(communities))
        return self._communities_cache

    # ------------------------------------------------------------------
    # Centrality Metrics
    # ------------------------------------------------------------------

    def get_centrality(self) -> dict:
        """Compute degree, betweenness, and PageRank centrality."""
        if self._centrality_cache is not None:
            return self._centrality_cache

        undirected = self.graph.to_undirected()

        degree = nx.degree_centrality(self.graph)
        betweenness = nx.betweenness_centrality(
            undirected, k=min(100, len(undirected))
        )
        pagerank = nx.pagerank(self.graph, max_iter=100)

        def _node_info(nid: str, score: float) -> dict:
            attrs = self.graph.nodes[nid]
            return {
                "id": nid,
                "type": attrs.get("type", ""),
                "label": attrs.get("label", nid),
                "score": round(score, 6),
            }

        top_n = 20
        self._centrality_cache = {
            "degree": [
                _node_info(nid, s)
                for nid, s in sorted(degree.items(), key=lambda x: x[1], reverse=True)[:top_n]
            ],
            "betweenness": [
                _node_info(nid, s)
                for nid, s in sorted(betweenness.items(), key=lambda x: x[1], reverse=True)[:top_n]
            ],
            "pagerank": [
                _node_info(nid, s)
                for nid, s in sorted(pagerank.items(), key=lambda x: x[1], reverse=True)[:top_n]
            ],
        }
        log.info("Centrality metrics computed")
        return self._centrality_cache
