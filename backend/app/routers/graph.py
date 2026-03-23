"""Graph API endpoints."""

from fastapi import APIRouter, Query
from ..graph_engine import GraphEngine

router = APIRouter(prefix="/api/graph", tags=["graph"])

_engine: GraphEngine | None = None


def init_router(engine: GraphEngine):
    global _engine
    _engine = engine


@router.get("/data")
def get_graph_data():
    return _engine.get_full_graph()


@router.get("/node/{node_id:path}")
def get_node_detail(node_id: str):
    detail = _engine.get_node_detail(node_id)
    if detail is None:
        return {"error": "Node not found"}
    return detail


@router.get("/search")
def search_nodes(q: str = Query(..., min_length=1), limit: int = 20):
    return _engine.search_nodes(q, limit=limit)


@router.get("/stats")
def get_graph_stats():
    return _engine.get_stats()


@router.get("/analytics")
def get_analytics():
    """Dashboard KPI analytics for the O2C dataset."""
    return _engine.get_analytics()


@router.get("/path")
def find_path(
    source: str = Query(..., description="Source node ID"),
    target: str = Query(..., description="Target node ID"),
):
    """Find shortest path between two graph nodes."""
    result = _engine.find_path(source, target)
    if result is None:
        return {"error": "No path found between the given nodes"}
    return result
