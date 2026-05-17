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


def explain_scenario(dataset_id: str, scenario: ScenarioPolicy) -> dict[str, Any]:
    _ensure_supported_dataset(dataset_id)
    base_result = solve_scenario(dataset_id, scenario)

    capacity_sensitivities = [
        _capacity_sensitivity(dataset_id, scenario, facility["id"], base_result)
        for facility in FACILITIES
    ]
    carbon_sensitivities = [
        _carbon_sensitivity(dataset_id, scenario, lift_pct, base_result)
        for lift_pct in (5, 10)
        if scenario.carbon_cap_kg is not None
    ]
    overtime_sensitivity = _overtime_sensitivity(dataset_id, scenario, base_result)

    recommendation_candidates = [
        *[
            {
                "label": "add_capacity",
                "target": item["facility_id"],
                "title": f"Add capacity at {item['facility_id']}",
                "rationale": "Repeated solve shows the profit and feasibility effect of a 10 percentage-point capacity lift.",
                "profit_delta_usd": item["profit_delta_usd"],
                "emissions_delta_kg": item["emissions_delta_kg"],
                "demand_met_delta_pct": item["demand_met_delta_pct"],
                "decision_status_improved": item["decision_status_improved"],
            }
            for item in capacity_sensitivities
        ],
        *[
            {
                "label": "relax_cap",
                "target": f"+{item['relaxation_pct']}%",
                "title": f"Model a {item['relaxation_pct']}% carbon-cap relaxation",
                "rationale": "Shows the economic value of extra allowances, offsets, or a phased target.",
                "profit_delta_usd": item["profit_delta_usd"],
                "emissions_delta_kg": item["emissions_delta_kg"],
                "demand_met_delta_pct": item["demand_met_delta_pct"],
                "decision_status_improved": item["decision_status_improved"],
            }
            for item in carbon_sensitivities
        ],
    ]

    if overtime_sensitivity is not None:
        recommendation_candidates.append({
            "label": "increase_overtime",
            "target": f"+{overtime_sensitivity['added_overtime_pct']}%",
            "title": f"Raise overtime allowance to {overtime_sensitivity['new_overtime_pct']}%",
            "rationale": "Tests whether short-run labor flexibility relieves the bottleneck before capex.",
            "profit_delta_usd": overtime_sensitivity["profit_delta_usd"],
            "emissions_delta_kg": overtime_sensitivity["emissions_delta_kg"],
            "demand_met_delta_pct": overtime_sensitivity["demand_met_delta_pct"],
            "decision_status_improved": overtime_sensitivity["decision_status_improved"],
        })

    if base_result["decision_status"] == "tradeoff_required":
        compliance_plan = base_result["plans"].get("protect_compliance") or {}
        recommendation_candidates.append({
            "label": "allow_unmet_demand",
            "target": "protect_compliance",
            "title": "Use the compliance-protected plan for this scenario",
            "rationale": "This is the deterministic plan that respects the carbon cap when full demand conflicts with compliance.",
            "profit_delta_usd": _metric(compliance_plan, "total_profit_usd") - _metric(base_result["plans"]["protect_demand"], "total_profit_usd"),
            "emissions_delta_kg": _metric(compliance_plan, "total_emissions_kg") - _metric(base_result["plans"]["protect_demand"], "total_emissions_kg"),
            "demand_met_delta_pct": _metric(compliance_plan, "demand_met_pct") - _metric(base_result["plans"]["protect_demand"], "demand_met_pct"),
            "decision_status_improved": False,
        })

    recommendations = sorted(
        recommendation_candidates,
        key=lambda item: (
            item["decision_status_improved"],
            item["profit_delta_usd"],
            item["demand_met_delta_pct"],
        ),
        reverse=True,
    )[:5]

    return {
        "solve_result": base_result,
        "capacity_sensitivities": capacity_sensitivities,
        "carbon_sensitivities": carbon_sensitivities,
        "overtime_sensitivity": overtime_sensitivity,
        "recommendations": recommendations,
    }


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


def _capacity_sensitivity(
    dataset_id: str,
    scenario: ScenarioPolicy,
    facility_id: str,
    base_result: dict[str, Any],
) -> dict[str, Any]:
    multipliers = dict(scenario.facility_capacity_multipliers)
    current_multiplier = multipliers.get(facility_id, 1)
    new_multiplier = min(2, round(current_multiplier + 0.1, 4))
    multipliers[facility_id] = new_multiplier

    scenario_variant = scenario.model_copy(update={"facility_capacity_multipliers": multipliers})
    result = solve_scenario(dataset_id, scenario_variant)
    return {
        "facility_id": facility_id,
        "base_multiplier": current_multiplier,
        "new_multiplier": new_multiplier,
        **_sensitivity_delta(base_result, result),
    }


def _carbon_sensitivity(
    dataset_id: str,
    scenario: ScenarioPolicy,
    relaxation_pct: int,
    base_result: dict[str, Any],
) -> dict[str, Any]:
    current_cap = scenario.carbon_cap_kg or 0
    new_cap = round(current_cap * (1 + relaxation_pct / 100), 2)
    scenario_variant = scenario.model_copy(update={"carbon_cap_kg": new_cap})
    result = solve_scenario(dataset_id, scenario_variant)
    return {
        "relaxation_pct": relaxation_pct,
        "base_carbon_cap_kg": current_cap,
        "new_carbon_cap_kg": new_cap,
        **_sensitivity_delta(base_result, result),
    }


def _overtime_sensitivity(
    dataset_id: str,
    scenario: ScenarioPolicy,
    base_result: dict[str, Any],
) -> dict[str, Any] | None:
    new_overtime_pct = min(20, scenario.max_overtime_pct + 5)
    if new_overtime_pct == scenario.max_overtime_pct:
        return None

    scenario_variant = scenario.model_copy(update={"max_overtime_pct": new_overtime_pct})
    result = solve_scenario(dataset_id, scenario_variant)
    return {
        "base_overtime_pct": scenario.max_overtime_pct,
        "new_overtime_pct": new_overtime_pct,
        "added_overtime_pct": round(new_overtime_pct - scenario.max_overtime_pct, 2),
        **_sensitivity_delta(base_result, result),
    }


def _sensitivity_delta(base_result: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    base_plan = _executive_plan(base_result)
    plan = _executive_plan(result)
    return {
        "decision_status": result["decision_status"],
        "decision_status_improved": _decision_rank(result["decision_status"]) > _decision_rank(base_result["decision_status"]),
        "profit_delta_usd": _round(_metric(plan, "total_profit_usd") - _metric(base_plan, "total_profit_usd")),
        "emissions_delta_kg": _round(_metric(plan, "total_emissions_kg") - _metric(base_plan, "total_emissions_kg")),
        "demand_met_delta_pct": _round(_metric(plan, "demand_met_pct") - _metric(base_plan, "demand_met_pct")),
        "unmet_demand_delta_units": _round(_metric(plan, "unmet_demand_total_units") - _metric(base_plan, "unmet_demand_total_units")),
    }


def _executive_plan(result: dict[str, Any]) -> dict[str, Any]:
    if result["decision_status"] == "tradeoff_required":
        compliance_plan = result["plans"].get("protect_compliance")
        if compliance_plan and compliance_plan.get("status") == "Optimal":
            return compliance_plan

    demand_plan = result["plans"].get("protect_demand") or {}
    if demand_plan.get("status") == "Optimal":
        return demand_plan

    return {}


def _decision_rank(decision_status: str) -> int:
    return {
        "infeasible": 0,
        "tradeoff_required": 1,
        "optimal": 2,
    }.get(decision_status, 0)


def _metric(plan: dict[str, Any], key: str) -> float:
    value = plan.get(key)
    return float(value) if value is not None else 0


def _round(value: float) -> float:
    return round(float(value), 2)


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
