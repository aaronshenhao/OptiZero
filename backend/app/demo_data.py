from copy import deepcopy
from typing import Any


DEMO_DATASET_ID = "demo"


PRODUCTS: list[dict[str, Any]] = [
    {"id": "P1", "name": "Industrial Motor", "price_usd": 950, "min_demand": 82000},
    {"id": "P2", "name": "Battery Module", "price_usd": 1420, "min_demand": 64000},
    {"id": "P3", "name": "Control Unit", "price_usd": 690, "min_demand": 98000},
    {"id": "P4", "name": "Precision Pump", "price_usd": 1180, "min_demand": 58000},
    {"id": "P5", "name": "Thermal Exchanger", "price_usd": 1680, "min_demand": 42000},
    {"id": "P6", "name": "EV Inverter", "price_usd": 2110, "min_demand": 36000},
    {"id": "P7", "name": "Smart Sensor Pack", "price_usd": 520, "min_demand": 125000},
    {"id": "P8", "name": "Hydraulic Assembly", "price_usd": 1340, "min_demand": 52000},
]


FACILITIES: list[dict[str, Any]] = [
    {
        "id": "factory_1",
        "name": "Factory 1 (Germany)",
        "max_operating_hours": 255000,
        "grid_emissions_factor": 0.27,
    },
    {
        "id": "factory_2",
        "name": "Factory 2 (Poland)",
        "max_operating_hours": 305000,
        "grid_emissions_factor": 0.62,
    },
    {
        "id": "factory_3",
        "name": "Factory 3 (Vietnam)",
        "max_operating_hours": 290000,
        "grid_emissions_factor": 0.44,
    },
    {
        "id": "factory_4",
        "name": "Factory 4 (Texas)",
        "max_operating_hours": 270000,
        "grid_emissions_factor": 0.39,
    },
    {
        "id": "factory_5",
        "name": "Factory 5 (Malaysia)",
        "max_operating_hours": 245000,
        "grid_emissions_factor": 0.53,
    },
]


_PRODUCT_ROUTE_PROFILES: dict[str, dict[str, float]] = {
    "P1": {"variable_cost_usd": 520, "kwh_per_unit": 120, "hours_per_unit": 1.45, "purchased_input_emissions_kg_per_unit": 670},
    "P2": {"variable_cost_usd": 820, "kwh_per_unit": 180, "hours_per_unit": 2.05, "purchased_input_emissions_kg_per_unit": 1350},
    "P3": {"variable_cost_usd": 360, "kwh_per_unit": 90, "hours_per_unit": 1.05, "purchased_input_emissions_kg_per_unit": 430},
    "P4": {"variable_cost_usd": 690, "kwh_per_unit": 150, "hours_per_unit": 1.75, "purchased_input_emissions_kg_per_unit": 920},
    "P5": {"variable_cost_usd": 980, "kwh_per_unit": 230, "hours_per_unit": 2.4, "purchased_input_emissions_kg_per_unit": 1780},
    "P6": {"variable_cost_usd": 1260, "kwh_per_unit": 260, "hours_per_unit": 2.65, "purchased_input_emissions_kg_per_unit": 2250},
    "P7": {"variable_cost_usd": 255, "kwh_per_unit": 65, "hours_per_unit": 0.75, "purchased_input_emissions_kg_per_unit": 260},
    "P8": {"variable_cost_usd": 780, "kwh_per_unit": 190, "hours_per_unit": 2.0, "purchased_input_emissions_kg_per_unit": 1180},
}


_FACILITY_ROUTE_ADJUSTMENTS: dict[str, dict[str, float]] = {
    "factory_1": {"cost_multiplier": 1.08, "energy_multiplier": 0.92, "hours_multiplier": 0.96, "input_multiplier": 0.95},
    "factory_2": {"cost_multiplier": 0.91, "energy_multiplier": 1.08, "hours_multiplier": 1.02, "input_multiplier": 1.08},
    "factory_3": {"cost_multiplier": 0.86, "energy_multiplier": 0.98, "hours_multiplier": 0.94, "input_multiplier": 1.03},
    "factory_4": {"cost_multiplier": 1.0, "energy_multiplier": 0.88, "hours_multiplier": 0.9, "input_multiplier": 0.9},
    "factory_5": {"cost_multiplier": 0.88, "energy_multiplier": 1.03, "hours_multiplier": 0.98, "input_multiplier": 1.12},
}


def get_demo_data() -> dict[str, list[dict[str, Any]]]:
    return {
        "products": deepcopy(PRODUCTS),
        "facilities": deepcopy(FACILITIES),
        "routes": _build_routes(),
    }


def get_scaled_products(demand_multiplier: float) -> list[dict[str, Any]]:
    products = deepcopy(PRODUCTS)
    for product in products:
        product["min_demand"] = round(product["min_demand"] * demand_multiplier, 2)
    return products


def _build_routes() -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []

    for facility in FACILITIES:
        facility_id = facility["id"]
        adjustment = _FACILITY_ROUTE_ADJUSTMENTS[facility_id]

        for product in PRODUCTS:
            product_id = product["id"]
            profile = _PRODUCT_ROUTE_PROFILES[product_id]
            routes.append(
                {
                    "facility_id": facility_id,
                    "product_id": product_id,
                    "variable_cost_usd": round(
                        profile["variable_cost_usd"] * adjustment["cost_multiplier"],
                        2,
                    ),
                    "kwh_per_unit": round(
                        profile["kwh_per_unit"] * adjustment["energy_multiplier"],
                        2,
                    ),
                    "hours_per_unit": round(
                        profile["hours_per_unit"] * adjustment["hours_multiplier"],
                        3,
                    ),
                    "purchased_input_emissions_kg_per_unit": round(
                        profile["purchased_input_emissions_kg_per_unit"] * adjustment["input_multiplier"],
                        2,
                    ),
                }
            )

    return routes
