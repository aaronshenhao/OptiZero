from typing import Any

from fastapi import APIRouter

from app.optimizer_service import (
    generate_pareto_points,
    get_supported_demo_data,
    solve_scenario,
)
from app.schemas import ParetoRequest, SolveRequest


router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])


@router.get("/demo-data")
async def demo_data() -> dict[str, list[dict[str, Any]]]:
    return get_supported_demo_data()


@router.post("/solve")
async def solve(request: SolveRequest) -> dict[str, Any]:
    return solve_scenario(request.dataset_id, request.scenario)


@router.post("/pareto")
async def pareto(request: ParetoRequest) -> dict[str, list[dict[str, Any]]]:
    return generate_pareto_points(
        request.dataset_id,
        request.scenario,
        request.carbon_cap_kg_points,
    )
