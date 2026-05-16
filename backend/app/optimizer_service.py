from typing import Any

from fastapi import HTTPException

from app.demo_data import DEMO_DATASET_ID, FACILITIES, get_demo_data, get_scaled_products
from app.schemas import ParetoScenarioPolicy, ScenarioPolicy
from app.solver import OptimizationEngine


def get_supported_demo_data() -> dict[str, list[dict[str, Any]]]:
    return get_demo_data()


def solve_scenario(dataset_id: str, scenario: ScenarioPolicy) -> dict[str, Any]:
    _ensure_supported_dataset(dataset_id)
    engine = _build_engine(scenario.demand_multiplier)
    return engine.solve(_policy_constraints(scenario))


def generate_pareto_points(
    dataset_id: str,
    scenario: ParetoScenarioPolicy,
    carbon_cap_kg_points: list[float],
) -> dict[str, list[dict[str, Any]]]:
    _ensure_supported_dataset(dataset_id)
    engine = _build_engine(scenario.demand_multiplier)
    base_policy = _policy_constraints(scenario)

    points = []
    for carbon_cap_kg in carbon_cap_kg_points:
        result = engine.solve({**base_policy, "carbon_cap_kg": carbon_cap_kg})
        points.append(_format_pareto_point(carbon_cap_kg, result))

    return {"points": points}


def _ensure_supported_dataset(dataset_id: str) -> None:
    if dataset_id != DEMO_DATASET_ID:
        raise HTTPException(
            status_code=404,
            detail=f"Unsupported dataset_id '{dataset_id}'. Only 'demo' is available.",
        )


def _build_engine(demand_multiplier: float) -> OptimizationEngine:
    demo = get_demo_data()
    return OptimizationEngine(
        products_data=get_scaled_products(demand_multiplier),
        facilities_data=FACILITIES,
        routing_data=demo["routes"],
    )


def _policy_constraints(scenario: ScenarioPolicy | ParetoScenarioPolicy) -> dict[str, Any]:
    constraints = {
        "max_overtime_pct": scenario.max_overtime_pct,
        "facility_capacity_multipliers": scenario.facility_capacity_multipliers,
    }

    if isinstance(scenario, ScenarioPolicy) and scenario.carbon_cap_kg is not None:
        constraints["carbon_cap_kg"] = scenario.carbon_cap_kg
    if scenario.carbon_penalty_usd_per_kg is not None:
        constraints["carbon_penalty_usd_per_kg"] = scenario.carbon_penalty_usd_per_kg
    if scenario.unmet_demand_penalty_usd_per_unit is not None:
        constraints["unmet_demand_penalty_usd_per_unit"] = (
            scenario.unmet_demand_penalty_usd_per_unit
        )

    return constraints


def _format_pareto_point(carbon_cap_kg: float, solve_result: dict[str, Any]) -> dict[str, Any]:
    demand_plan = solve_result["plans"]["protect_demand"]
    if demand_plan.get("status") != "Optimal":
        return _infeasible_pareto_point(carbon_cap_kg, solve_result["decision_status"])

    point = {
        "carbon_cap_kg": round(carbon_cap_kg, 2),
        "decision_status": solve_result["decision_status"],
        "profit_usd": demand_plan["total_profit_usd"],
        "total_emissions_kg": demand_plan["total_emissions_kg"],
        "demand_met_pct": demand_plan["demand_met_pct"],
        "carbon_overage_kg": demand_plan["carbon_overage_kg"],
        "unmet_demand_total_units": demand_plan["unmet_demand_total_units"],
    }

    compliance_plan = solve_result["plans"].get("protect_compliance")
    if compliance_plan and compliance_plan.get("status") == "Optimal":
        point["compliance_fallback"] = {
            "profit_usd": compliance_plan["total_profit_usd"],
            "total_emissions_kg": compliance_plan["total_emissions_kg"],
            "demand_met_pct": compliance_plan["demand_met_pct"],
            "carbon_overage_kg": compliance_plan["carbon_overage_kg"],
            "unmet_demand_total_units": compliance_plan["unmet_demand_total_units"],
        }

    return point


def _infeasible_pareto_point(carbon_cap_kg: float, decision_status: str) -> dict[str, Any]:
    return {
        "carbon_cap_kg": round(carbon_cap_kg, 2),
        "decision_status": decision_status,
        "profit_usd": 0,
        "total_emissions_kg": 0,
        "demand_met_pct": 0,
        "carbon_overage_kg": 0,
        "unmet_demand_total_units": 0,
    }
