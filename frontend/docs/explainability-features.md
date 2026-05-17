# Explainability Tab Feature Guide

The Explainability tab is the executive trust layer for OptiZero. Scenario Studio answers "what is the optimal plan?" and the Explainability tab answers "why should I believe it, what is constraining us, and what should we do next?"

This is what makes the product feel like a decision intelligence engine instead of a calculator: the optimizer does not only evaluate a scenario, it exposes the trade-offs, bottlenecks, and intervention levers behind the recommended plan.

## Data Flow

The tab uses three data sources:

- Active scenario state from `src/store/scenarioStore.ts`, including the selected plan mode, carbon cap, outage multiplier, demand surge, overtime, and latest `/solve` result.
- Demo metadata from `GET /api/optimizer/demo-data`, used to translate product/factory IDs into readable names and calculate facility utilization from route hours.
- Explainability results from `POST /api/optimizer/explain`, implemented in `../backend/app/optimizer_service.py`, which wraps the normal solve result plus repeated-solve sensitivities.

The frontend entrypoint is `src/components/scenario/ExplainabilityTab.tsx`. The API types and mock fallback live in `src/services/optimizerApi.ts`.

## Executive Decision Brief

What it shows:

- A one-sentence verdict for the active scenario.
- Selected plan mode: `Protect Demand` or `Protect Compliance`.
- Solver status.
- Demand met percentage.
- Carbon overage.

Why it matters:

Executives need the headline first. If there is a carbon compliance conflict, this panel says so directly, including unmet demand and profit impact. If the plan is feasible, it confirms that demand and carbon guardrails can both be satisfied.

How it is implemented:

- Uses the selected plan from `selectPlan(activeScenario)`.
- Uses `solveResult.tradeoff_summary` when `decision_status === "tradeoff_required"`.
- Uses `carbon_overage_kg`, `demand_met_pct`, `mode`, and `status` from the selected `OptimizationPlan`.

## Next Best Actions

What it shows:

- Ranked actions such as adding capacity, relaxing the carbon cap, increasing overtime, or switching to the compliance-protected plan.
- Profit lift from each action.
- Demand lift in percentage points.
- Whether the action improves scenario status.

Why it matters:

This is the clearest "not a calculator" feature. Instead of stopping at "Factory 4 is binding," the app says which levers are worth testing and quantifies their effect.

How it is implemented:

- Backend route: `POST /api/optimizer/explain`.
- The backend re-solves the same scenario after small controlled changes:
  - `+10 percentage points` capacity multiplier for each factory, capped at `2`.
  - `+5%` and `+10%` carbon cap relaxation.
  - `+5 percentage points` max overtime, capped at `20`.
- Recommendations are sorted by status improvement, profit delta, and demand delta.
- The frontend renders `explainResult.recommendations`.

Developer note:

Shadow prices can be hard to explain in a demo. These recommendations use finite-difference re-solves, which are slower than reading dual values but much easier to defend to judges.

## Constraint Watchlist

What it shows:

- Binding or economically relevant constraints returned by the solver.
- Constraint group: Carbon, Capacity, Demand, or Other.
- Slack.
- Marginal value.
- A plain-English interpretation.

Why it matters:

This answers "what is limiting us?" For example, a binding capacity constraint means a facility has no spare labor-hour headroom. A carbon cap with overage means full demand can only be protected by relaxing compliance.

How it is implemented:

- Backend solver emits `binding_constraints` in `../backend/app/solver.py` from PuLP constraint slack and dual value (`constraint.pi`).
- Frontend function `buildWatchlist()` maps raw names like `Demand_P6`, `Capacity_factory_4`, and `Soft_Global_Carbon_Cap` into readable labels.
- Constraints are sorted by absolute marginal value so the most economically important rows appear first.

Developer note:

The displayed "Marginal Value" is useful as directional evidence, but for executive recommendations prefer the repeated-solve sensitivity outputs.

## Investment Sensitivity

What it shows:

- A horizontal bar chart of profit lift by lever.
- Capacity levers, carbon-cap relaxations, and overtime changes in one visual ranking.

Why it matters:

Executives want to know which decision is worth attention. The chart makes the opportunity cost visible: "Which lever creates the most value under this exact carbon constraint?"

How it is implemented:

- Uses Recharts in `ExplainabilityTab.tsx`.
- Builds chart rows from:
  - `capacity_sensitivities`
  - `carbon_sensitivities`
  - `overtime_sensitivity`
- Sorts by `profit_delta_usd` and displays the top levers.

## Operating Bottlenecks

What it shows:

- Factory-level labor-hour utilization.
- Used hours versus available hours.
- Status badge: `Binding`, `Tight`, or `Available`.

Why it matters:

This turns the mathematical capacity constraints into an operating story. A C-level user can quickly see which facilities are fully loaded, which have spare capacity, and where a strike/outage is biting.

How it is implemented:

- Frontend-only derived calculation in `buildFacilityUtilization()`.
- For each production allocation, the frontend looks up the route's `hours_per_unit` from demo data.
- Used hours = `units_assigned * hours_per_unit`.
- Available hours = `facility.max_operating_hours * (1 + maxOvertimePct / 100) * facilityCapacityMultiplier`.
- Status thresholds:
  - `Binding`: utilization at or above `98%`.
  - `Tight`: utilization at or above `85%`.
  - `Available`: below `85%`.

## Trade-off Explanation

What it shows:

- Whether full demand conflicts with carbon compliance.
- Carbon gap if demand is protected.
- Unmet demand if compliance is protected.
- Profit delta between the two plan modes.

Why it matters:

This gives the team a clear executive narrative: "We can meet all demand, but we exceed the cap," or "We can comply, but we sacrifice these units and this profit."

How it is implemented:

- Uses `solveResult.tradeoff_summary` from `/solve`.
- Uses `plans.protect_demand` for the full-demand plan.
- Uses `plans.protect_compliance` when the carbon cap cannot be met while fulfilling full demand.
- The selected mode comes from `selectedPlanMode` in Zustand state.

## Demand and Compliance Risks

What it shows:

- Carbon overage risk.
- Demand shortfalls by product.
- Relaxed constraints used by the solver.
- Infeasible scenario warning.

Why it matters:

This is the auditability panel. It surfaces the business promises the model had to bend, which is essential for compliance-heavy ESG conversations.

How it is implemented:

- Uses `selectedPlan.carbon_overage_kg`.
- Uses `selectedPlan.demand_shortfalls`.
- Uses `selectedPlan.relaxed_constraints`.
- For infeasible scenarios, displays `selectedPlan.error` or the scenario error message.

Backend behavior:

- In `protect_demand` mode, the carbon cap is soft and carbon overage appears as a relaxed carbon-cap constraint.
- In `protect_compliance` mode, demand can be softened and product shortfalls appear as relaxed demand constraints.

## Why Production Moved Here

What it shows:

- Top production routes by profit per hour.
- Product and factory names.
- Units assigned.
- Profit per hour.
- CO2e per unit.

Why it matters:

This explains why the optimizer allocated production to certain facility-product combinations. It connects financial productivity, carbon intensity, and capacity usage in a way a judge or executive can understand.

How it is implemented:

- Frontend-only derived calculation in `buildRouteRationale()`.
- Joins selected `production_plan` rows with demo route metadata.
- Calculates `hoursUsed = units_assigned * hours_per_unit`.
- Calculates `profitPerHour = profit_usd / hoursUsed`.
- Sorts descending by profit per hour.

## Backend Explain Endpoint

Route:

```http
POST /api/optimizer/explain
```

Request body matches `/api/optimizer/solve`:

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

Response fields:

- `solve_result`: normal solver response.
- `capacity_sensitivities`: one re-solve per facility.
- `carbon_sensitivities`: re-solves for `+5%` and `+10%` carbon cap.
- `overtime_sensitivity`: one re-solve with `+5` overtime points, unless already at `20`.
- `recommendations`: deterministic ranked actions derived from sensitivity results.

## Demo Story

A strong demo sequence for this tab:

1. Open with the Executive Decision Brief: "The optimizer found a plan, but carbon compliance creates a quantified trade-off."
2. Point to the Constraint Watchlist: "These are the binding business rules driving the plan."
3. Show Operating Bottlenecks: "Factory 4 and Factory 1 are fully loaded, so reallocating is constrained by labor hours."
4. Show Next Best Actions and Investment Sensitivity: "We re-solve possible interventions and rank them by value."
5. Close with Risks: "The model tells us exactly which guardrails were relaxed, so this is auditable rather than black-box AI."
