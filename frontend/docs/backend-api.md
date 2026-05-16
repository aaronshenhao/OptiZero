# Optimizer Backend API Contract

The frontend is wired to call these routes and falls back to local mock responses until they exist.

## `GET /api/optimizer/demo-data`

Returns metadata for labels, default controls, and future richer visualizations.

```json
{
  "products": [
    { "id": "P1", "name": "Industrial Motor", "price_usd": 950, "min_demand": 7500 }
  ],
  "facilities": [
    { "id": "factory_1", "name": "Factory 1", "max_operating_hours": 32000, "grid_emissions_factor": 0.27 }
  ],
  "routes": [
    {
      "facility_id": "factory_1",
      "product_id": "P1",
      "variable_cost_usd": 520,
      "kwh_per_unit": 120,
      "hours_per_unit": 1.6,
      "purchased_input_emissions_kg_per_unit": 28
    }
  ]
}
```

## `POST /api/optimizer/solve`

Runs one scenario. The response should be the `OptimizationEngine.solve(...)` output exactly.

```json
{
  "dataset_id": "demo",
  "scenario": {
    "carbon_cap_kg": 500000000,
    "max_overtime_pct": 10,
    "facility_capacity_multipliers": { "factory_3": 0.7 },
    "demand_multiplier": 1.15,
    "carbon_penalty_usd_per_kg": null,
    "unmet_demand_penalty_usd_per_unit": null
  }
}
```

Backend should apply `demand_multiplier` to product `min_demand` before constructing the engine.

## `POST /api/optimizer/pareto`

Runs the solver across carbon cap points and returns chart-ready results. For `tradeoff_required`, use the `protect_compliance` plan for profit, emissions, and demand met; otherwise use `protect_demand`.

```json
{
  "dataset_id": "demo",
  "scenario": {
    "max_overtime_pct": 10,
    "facility_capacity_multipliers": { "factory_3": 0.7 },
    "demand_multiplier": 1.15,
    "carbon_penalty_usd_per_kg": null,
    "unmet_demand_penalty_usd_per_unit": null
  },
  "carbon_cap_kg_points": [50000000, 100000000, 150000000, 200000000]
}
```

```json
{
  "points": [
    {
      "carbon_cap_kg": 150000000,
      "decision_status": "tradeoff_required",
      "profit_usd": 8900000,
      "total_emissions_kg": 150000000,
      "demand_met_pct": 94.2,
      "carbon_overage_kg": 0,
      "unmet_demand_total_units": 1200
    }
  ]
}
```
