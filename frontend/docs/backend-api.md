# Optimizer Backend API Contract

The frontend is wired to call these routes and falls back to local mock responses until they exist.

## Local connection

Run the backend on port `8000`:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`0.0.0.0` is a server bind address. Browser/client requests should use `localhost`, `127.0.0.1`, or the deployed backend hostname.

In frontend development, Vite proxies relative `/api/*` requests to `http://127.0.0.1:8000`, so the frontend can keep calling `/api/optimizer/...` without CORS.

```bash
pnpm run dev
```

Frontend API behavior is controlled by env vars:

```bash
VITE_OPTIMIZER_API_MODE=fallback
VITE_OPTIMIZER_API_BASE_URL=
```

Modes:

- `live`: backend failures are surfaced to the UI.
- `fallback`: backend failures use mock data so demos remain usable.
- `mock`: backend is never called.

For direct split-origin development, set:

```bash
VITE_OPTIMIZER_API_BASE_URL=http://localhost:8000
```

## Hosting guidance

Preferred production setup: serve the frontend and backend behind one domain, route `/api/*` to FastAPI, and route all other paths to the frontend static app. This keeps frontend API calls relative and avoids browser CORS.

Alternative setup: deploy the backend separately and set:

```bash
VITE_OPTIMIZER_API_BASE_URL=https://your-api-domain
```

If using split origins, backend CORS should be configured from environment variables and include the deployed frontend origin.

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

Runs the solver across carbon cap points and returns chart-ready results.

Current backend compatibility:

- Top-level point fields are interpreted as `protect_demand`.
- `compliance_fallback`, when present, is interpreted as `protect_compliance`.
- The frontend plots both as separate curves.

Future preferred contract: return explicit `protect_demand` and `protect_compliance` objects for each point instead of the `compliance_fallback` name.

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
      "unmet_demand_total_units": 1200,
      "compliance_fallback": {
        "profit_usd": 7600000,
        "total_emissions_kg": 150000000,
        "demand_met_pct": 88.1,
        "carbon_overage_kg": 0,
        "unmet_demand_total_units": 5100
      }
    }
  ]
}
```
