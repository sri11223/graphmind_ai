"""Graph API endpoints.

Provides access to the knowledge graph data, node detail, search,
analytics dashboard KPIs, and shortest-path finder.
"""

from fastapi import APIRouter, HTTPException, Query, status
from ..graph_engine import GraphEngine
from ..schemas import (
    AnalyticsResponse,
    ErrorResponse,
    GraphDataResponse,
    NodeDetailResponse,
    PathResponse,
    SearchResult,
    StatsResponse,
)

router = APIRouter(prefix="/api/graph", tags=["graph"])

_engine: GraphEngine | None = None


def init_router(engine: GraphEngine):
    global _engine
    _engine = engine


@router.get(
    "/data",
    response_model=GraphDataResponse,
    summary="Full graph data",
    description="Returns all nodes and links for the force-directed visualisation. Cached after first call.",
)
def get_graph_data():
    return _engine.get_full_graph()


@router.get(
    "/node/{node_id:path}",
    response_model=NodeDetailResponse,
    summary="Node detail",
    description="Returns a single node's properties and its direct neighbors (incoming + outgoing edges).",
    responses={404: {"model": ErrorResponse, "description": "Node not found"}},
)
def get_node_detail(node_id: str):
    detail = _engine.get_node_detail(node_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return detail


@router.get(
    "/search",
    response_model=list[SearchResult],
    summary="Search nodes",
    description="Fuzzy search across all node IDs and labels. Returns up to `limit` matches.",
)
def search_nodes(q: str = Query(..., min_length=1, description="Search query"), limit: int = 20):
    return _engine.search_nodes(q, limit=limit)


@router.get(
    "/stats",
    response_model=StatsResponse,
    summary="Graph statistics",
    description="Aggregate counts of nodes and edges by entity type.",
)
def get_graph_stats():
    return _engine.get_stats()


@router.get(
    "/analytics",
    response_model=AnalyticsResponse,
    summary="O2C analytics dashboard",
    description="KPI metrics: O2C funnel completion, total revenue, top customers/products, monthly trend, and status distribution.",
)
def get_analytics():
    return _engine.get_analytics()


@router.get(
    "/path",
    response_model=PathResponse,
    summary="Shortest path",
    description="Find the shortest path between two graph nodes (treating edges as undirected).",
    responses={404: {"model": ErrorResponse, "description": "No path found"}},
)
def find_path(
    source: str = Query(..., description="Source node ID (e.g. SO:740506)"),
    target: str = Query(..., description="Target node ID (e.g. CUST:10100001)"),
):
    result = _engine.find_path(source, target)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No path found between the given nodes")
    return result
