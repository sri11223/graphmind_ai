# Graph Engine: Algorithms and Data Structures

## The Graph Structure

The in-memory graph is a `networkx.DiGraph` — directed, because O2C relationships have direction. A sales order points to a customer (sold-to), not the other way around. A delivery gets billed-as a billing document, not the reverse. Direction matters for tracing flows and for algorithms like PageRank that are sensitive to edge orientation.

**8 node types**, each with a prefix to avoid ID collisions:

| Type | Prefix | Source |
|------|--------|--------|
| SalesOrder | `SO:` | sales_order_headers.salesOrder |
| Delivery | `DEL:` | outbound_delivery_headers |
| BillingDocument | `BD:` | billing_document_headers |
| JournalEntry | `JE:` | journal_entries (grouped by accountingDocument) |
| Payment | `PAY:` | journal_entries WHERE clearingAccountingDocument IS NOT NULL |
| Customer | `CUST:` | business_partners |
| Product | `PROD:` | products |
| Plant | `PLANT:` | plants |

**9 edge types** encoding the O2C causal chain:

```
SO → CUST    :  SOLD_TO
SO → PROD    :  ORDERED_PRODUCT
SO → DEL     :  FULFILLED_BY
DEL → PLANT  :  SHIPPED_FROM
DEL → BD     :  BILLED_AS
BD → CUST    :  INVOICED_TO
BD → JE      :  POSTED_AS
JE → PAY     :  CLEARED_BY
PROD → PLANT :  AVAILABLE_AT
```

The full graph at startup: **669 nodes, 4,044 edges**.

---

## TF-IDF Search Index

Built once after the graph is constructed, lazily (first `semantic_search()` call triggers it).

**Why build it at all?** Simple substring search on 669 nodes is fast but dumb — searching "nelson" matches ID fields literally, not properties semantically. TF-IDF lets a query like "billing payment revenue" surface nodes whose combined text is most relevant even if no single word appears verbatim.

**The formula:**

IDF (Inverse Document Frequency, smoothed):
```
idf(t) = log((N + 1) / (df(t) + 1)) + 1
```
where `N` = total nodes, `df(t)` = number of nodes whose text contains term `t`. The `+1` additive smoothing prevents zero-division and reduces the penalty for very common terms.

TF (Term Frequency):
```
tf(t, d) = raw count of term t in document d
```
Plain counts from `Counter(re.findall(r"\w+", text))`.

TF-IDF weight:
```
tfidf(t, d) = tf(t, d) * idf(t)
```

Document vector normalisation (L2):
```
norm(d) = sqrt(sum(tfidf(t,d)^2 for all t))
vec(d) = {t: tfidf(t,d) / norm(d) for all t}
```

Query scoring (cosine similarity):
```
score(q, d) = sum(qvec(t) * dvec(t) for t in query_tokens ∩ doc_tokens)
```

Only documents with `score > 0.01` are returned. Results are sorted descending by score.

**Hybrid search** combines substring and semantic:
- Exact substring match on node ID → score `2.0`
- Partial substring match on any property → score `1.5`
- TF-IDF cosine similarity added on top for all candidates
- Results deduplicated and re-ranked by combined score

---

## Community Detection (Louvain)

```python
undirected = self.graph.to_undirected()
communities = louvain_communities(undirected, seed=42)
```

The graph is converted to undirected first because Louvain is defined on undirected graphs. Running it on the directed version would require choosing how to handle bidirectional edges — converting to undirected folds both directions into a single edge, which is the right semantics for "these entities are related to each other."

`seed=42` makes the result deterministic across restarts. Louvain is a randomised algorithm — without a fixed seed, you'd get slightly different clusters each time the container starts.

The result on this dataset: **9 communities**, mostly organised around customer clusters. The largest community (464 nodes) captures the main O2C flow backbone. Smaller communities (8-113 nodes) represent customers or product groups with tighter internal connectivity.

Computed once, cached permanently in `self._communities_cache`. Subsequent calls return the cached result in microseconds.

---

## Centrality Metrics

Three separate algorithms, each measuring a different notion of "importance":

**Degree Centrality** (`nx.degree_centrality(self.graph)`)
- Ratio of connections a node has to the maximum possible
- Works on the directed graph
- High degree = hub that connects many entities
- In this dataset: high-volume customers and products score highest

**Betweenness Centrality** (`nx.betweenness_centrality(undirected, k=min(100, n))`)
- Fraction of all shortest paths that pass through a node
- Works on undirected graph (flow can go either direction in the O2C chain)
- Approximated with `k` pivot nodes — computing exact betweenness on 669 nodes is manageable (~O(n*m)) but the approximation with k=100 is faster and accurate enough
- High betweenness = bottleneck or connector in the flow network

**PageRank** (`nx.pagerank(self.graph, max_iter=100)`)
- Random walk probability of landing on each node
- Works on the directed graph — direction actually matters here (edges point in the flow direction)
- High PageRank = nodes that are pointed to by many other important nodes
- In this dataset: top-ranking customers score 0.096, reflecting that almost every O2C flow terminates at (or originates from) a customer node

Top-20 nodes returned for each metric. Cached permanently alongside communities.

---

## Shortest Path

```python
path = nx.shortest_path(self.graph.to_undirected(), source_id, target_id)
```

Undirected again — path-finding between, say, a sales order and a payment needs to traverse the causal chain in both directions (or at least find an undirected route). The directed graph would make many pairs unreachable (you can't go from a Payment back to a SalesOrder following directed edges).

Returns `None` (→ 404) on `NetworkXNoPath` exception.

---

## Why Everything Is Cached

The graph algorithms are:
- Communities with Louvain: ~100ms on this graph size
- Betweenness centrality (approximate, k=100): ~200ms
- PageRank: ~50ms
- TF-IDF index build: ~80ms

None of these are prohibitively slow, but they're expensive relative to a simple API response. More importantly, the graph is **read-only** — it never changes after startup. Caching the results indefinitely is not just safe, it's the correct architectural choice. There's no cache invalidation logic because there's nothing to invalidate.

The full graph JSON (`get_graph_data()`) is also cached:
```python
if self._cache:
    return self._cache
```
The first frontend load triggers the serialisation of all 669 nodes and 4,044 edges. Every subsequent request returns the cached dict. On Render's free tier with cold starts, this makes the first graph load a little slow but every subsequent load instant.
