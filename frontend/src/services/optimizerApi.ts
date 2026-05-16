export const KG_PER_TON = 1000;

export type PlanMode = "protect_demand" | "protect_compliance";
export type DecisionStatus = "optimal" | "tradeoff_required" | "infeasible";
export type SolverStatus = "Optimal" | "Infeasible" | "Unbounded" | "Undefined" | string;

export type Product = {
  id: string;
  name: string;
  price_usd: number;
  min_demand: number;
};

export type Facility = {
  id: string;
  name: string;
  max_operating_hours: number;
  grid_emissions_factor: number;
};

export type Route = {
  facility_id: string;
  product_id: string;
  variable_cost_usd: number;
  kwh_per_unit: number;
  hours_per_unit: number;
  purchased_input_emissions_kg_per_unit: number;
};

export type DemoDataResponse = {
  products: Product[];
  facilities: Facility[];
  routes: Route[];
};

export type ScenarioPolicyRequest = {
  carbon_cap_kg: number | null;
  max_overtime_pct: number;
  facility_capacity_multipliers: Record<string, number>;
  demand_multiplier: number;
  carbon_penalty_usd_per_kg: number | null;
  unmet_demand_penalty_usd_per_unit: number | null;
};

export type SolveRequest = {
  dataset_id: string;
  scenario: ScenarioPolicyRequest;
};

export type ProductionAllocation = {
  facility_id: string;
  product_id: string;
  units_assigned: number;
  profit_usd: number;
  emissions_kg: number;
  production_energy_emissions_kg: number;
  purchased_input_emissions_kg: number;
  emissions_kg_per_unit: number;
  production_energy_emissions_kg_per_unit: number;
  purchased_input_emissions_kg_per_unit: number;
};

export type BindingConstraint = {
  constraint_name: string;
  slack: number;
  marginal_value: number;
};

export type RelaxedConstraint =
  | {
      constraint_name: string;
      type: "carbon_cap";
      relaxed_by_kg: number;
    }
  | {
      constraint_name: string;
      type: "demand";
      product_id: string;
      relaxed_by_units: number;
    };

export type DemandShortfall = {
  product_id: string;
  unmet_units: number;
};

export type OptimizationPlan = {
  mode: PlanMode;
  status: SolverStatus;
  error?: string;
  total_profit_usd?: number;
  optimization_objective_value?: number;
  total_emissions_kg?: number;
  carbon_overage_kg?: number;
  demand_met_units?: number;
  total_demand_units?: number;
  demand_met_pct?: number;
  unmet_demand_total_units?: number;
  demand_shortfalls?: DemandShortfall[];
  relaxed_constraints?: RelaxedConstraint[];
  production_plan?: ProductionAllocation[];
  binding_constraints?: BindingConstraint[];
};

export type TradeoffSummary = {
  message: string;
  carbon_gap_kg_if_demand_protected: number;
  unmet_demand_units_if_compliance_protected: number;
  profit_delta_usd_if_compliance_protected: number;
};

export type SolveResponse = {
  status: SolverStatus;
  decision_status: DecisionStatus;
  carbon_cap_kg: number | null;
  has_compliance_gap: boolean;
  plans: {
    protect_demand: OptimizationPlan;
    protect_compliance: OptimizationPlan | null;
  };
  tradeoff_summary: TradeoffSummary | null;
};

export type ParetoRequest = {
  dataset_id: string;
  scenario: Omit<ScenarioPolicyRequest, "carbon_cap_kg">;
  carbon_cap_kg_points: number[];
};

export type ParetoPointResponse = {
  carbon_cap_kg: number;
  decision_status: DecisionStatus;
  profit_usd: number;
  total_emissions_kg: number;
  demand_met_pct: number;
  carbon_overage_kg: number;
  unmet_demand_total_units: number;
};

export type ParetoResponse = {
  points: ParetoPointResponse[];
};

export type FrontendScenarioInputs = {
  carbonCap: number;
  factoryOutage: number;
  demandSurge: number;
  allowUnmetDemand: boolean;
  maxOvertimePct: number;
  facilityCapacityMultipliers: Record<string, number>;
  demandMultiplier: number;
};

export function tonsToKg(tons: number) {
  return Math.round(tons * KG_PER_TON);
}

export function kgToTons(kg?: number | null) {
  return (kg ?? 0) / KG_PER_TON;
}

export function buildScenarioPolicy(scenario: FrontendScenarioInputs): ScenarioPolicyRequest {
  return {
    carbon_cap_kg: tonsToKg(scenario.carbonCap),
    max_overtime_pct: scenario.maxOvertimePct,
    facility_capacity_multipliers: scenario.facilityCapacityMultipliers,
    demand_multiplier: scenario.demandMultiplier,
    carbon_penalty_usd_per_kg: null,
    unmet_demand_penalty_usd_per_unit: null,
  };
}

export function getSelectedPlan(response: SolveResponse | undefined, preferredMode: PlanMode): OptimizationPlan | null {
  if (!response) return null;

  const preferred = response.plans[preferredMode];
  if (preferred?.status === "Optimal") return preferred;

  const demandPlan = response.plans.protect_demand;
  if (demandPlan?.status === "Optimal") return demandPlan;

  const compliancePlan = response.plans.protect_compliance;
  if (compliancePlan?.status === "Optimal") return compliancePlan;

  return preferred ?? demandPlan ?? compliancePlan ?? null;
}

export async function fetchDemoData(): Promise<DemoDataResponse> {
  return requestWithMockFallback("/api/optimizer/demo-data", undefined, createMockDemoData);
}

export async function solveScenario(request: SolveRequest): Promise<SolveResponse> {
  return requestWithMockFallback("/api/optimizer/solve", request, () => createMockSolveResponse(request.scenario));
}

export async function generateParetoFrontier(request: ParetoRequest): Promise<ParetoResponse> {
  return requestWithMockFallback("/api/optimizer/pareto", request, () => createMockParetoResponse(request));
}

async function requestWithMockFallback<T>(path: string, body: unknown, createMock: () => T): Promise<T> {
  try {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) throw new Error(`Optimizer API returned ${response.status}`);
    return (await response.json()) as T;
  } catch {
    return createMock();
  }
}

function createMockDemoData(): DemoDataResponse {
  return {
    products: [
      { id: "P1", name: "Industrial Motor", price_usd: 950, min_demand: 7500 },
      { id: "P2", name: "Battery Module", price_usd: 1400, min_demand: 6200 },
      { id: "P3", name: "Control Unit", price_usd: 680, min_demand: 8800 },
    ],
    facilities: [
      { id: "factory_1", name: "Factory 1 (Germany)", max_operating_hours: 32000, grid_emissions_factor: 0.27 },
      { id: "factory_2", name: "Factory 2 (Poland)", max_operating_hours: 36000, grid_emissions_factor: 0.62 },
      { id: "factory_3", name: "Factory 3 (Vietnam)", max_operating_hours: 34000, grid_emissions_factor: 0.44 },
    ],
    routes: [
      { facility_id: "factory_1", product_id: "P1", variable_cost_usd: 520, kwh_per_unit: 120, hours_per_unit: 1.6, purchased_input_emissions_kg_per_unit: 28 },
      { facility_id: "factory_1", product_id: "P2", variable_cost_usd: 910, kwh_per_unit: 180, hours_per_unit: 2.2, purchased_input_emissions_kg_per_unit: 80 },
      { facility_id: "factory_2", product_id: "P2", variable_cost_usd: 760, kwh_per_unit: 170, hours_per_unit: 2.0, purchased_input_emissions_kg_per_unit: 75 },
      { facility_id: "factory_2", product_id: "P3", variable_cost_usd: 350, kwh_per_unit: 95, hours_per_unit: 1.2, purchased_input_emissions_kg_per_unit: 22 },
      { facility_id: "factory_3", product_id: "P1", variable_cost_usd: 470, kwh_per_unit: 105, hours_per_unit: 1.4, purchased_input_emissions_kg_per_unit: 30 },
      { facility_id: "factory_3", product_id: "P3", variable_cost_usd: 390, kwh_per_unit: 80, hours_per_unit: 1.1, purchased_input_emissions_kg_per_unit: 18 },
    ],
  };
}

function createMockSolveResponse(policy: ScenarioPolicyRequest): SolveResponse {
  const carbonCapKg = policy.carbon_cap_kg ?? 500000000;
  const outageMultiplier = policy.facility_capacity_multipliers.factory_3 ?? 1;
  const outagePct = Math.max(0, Math.min(1, 1 - outageMultiplier));
  const demandMultiplier = policy.demand_multiplier || 1;
  const overtimeLift = 1 + policy.max_overtime_pct / 100;
  const baselineDemandUnits = 22500 * demandMultiplier;
  const naturalEmissionsKg = 450000000 * demandMultiplier * (1 - outagePct * 0.18);
  const naturalProfitUsd = Math.max(
    0,
    15400000 * demandMultiplier * overtimeLift - outagePct * 1800000
  );

  if (outagePct > 0.65 && policy.max_overtime_pct < 5) {
    return {
      status: "Infeasible",
      decision_status: "infeasible",
      carbon_cap_kg: carbonCapKg,
      has_compliance_gap: false,
      plans: {
        protect_demand: {
          mode: "protect_demand",
          status: "Infeasible",
          error: "Problem is infeasible with current hard constraints.",
        },
        protect_compliance: null,
      },
      tradeoff_summary: null,
    };
  }

  const hasComplianceGap = carbonCapKg < naturalEmissionsKg;
  const carbonOverageKg = Math.max(0, naturalEmissionsKg - carbonCapKg);
  const demandPlan = createMockPlan({
    mode: "protect_demand",
    totalProfitUsd: naturalProfitUsd,
    totalEmissionsKg: naturalEmissionsKg,
    carbonOverageKg,
    demandMetPct: 100,
    demandUnits: baselineDemandUnits,
  });

  if (!hasComplianceGap) {
    return {
      status: "Optimal",
      decision_status: "optimal",
      carbon_cap_kg: carbonCapKg,
      has_compliance_gap: false,
      plans: {
        protect_demand: demandPlan,
        protect_compliance: null,
      },
      tradeoff_summary: null,
    };
  }

  const capSeverity = Math.min(0.85, carbonOverageKg / Math.max(naturalEmissionsKg, 1));
  const complianceDemandMetPct = Math.max(68, 100 - capSeverity * 55 - outagePct * 8);
  const complianceProfitUsd = naturalProfitUsd * (complianceDemandMetPct / 100) - capSeverity * 1800000;
  const unmetDemandUnits = baselineDemandUnits * (1 - complianceDemandMetPct / 100);
  const compliancePlan = createMockPlan({
    mode: "protect_compliance",
    totalProfitUsd: Math.max(0, complianceProfitUsd),
    totalEmissionsKg: carbonCapKg,
    carbonOverageKg: 0,
    demandMetPct: complianceDemandMetPct,
    demandUnits: baselineDemandUnits,
  });

  return {
    status: "Optimal",
    decision_status: "tradeoff_required",
    carbon_cap_kg: carbonCapKg,
    has_compliance_gap: true,
    plans: {
      protect_demand: demandPlan,
      protect_compliance: compliancePlan,
    },
    tradeoff_summary: {
      message: "The carbon cap cannot be met while fulfilling all demand under current constraints.",
      carbon_gap_kg_if_demand_protected: Math.round(carbonOverageKg),
      unmet_demand_units_if_compliance_protected: Math.round(unmetDemandUnits),
      profit_delta_usd_if_compliance_protected: Math.round(compliancePlan.total_profit_usd! - demandPlan.total_profit_usd!),
    },
  };
}

function createMockPlan(input: {
  mode: PlanMode;
  totalProfitUsd: number;
  totalEmissionsKg: number;
  carbonOverageKg: number;
  demandMetPct: number;
  demandUnits: number;
}): OptimizationPlan {
  const demandMetUnits = input.demandUnits * (input.demandMetPct / 100);
  const allocations = createMockAllocations(input.totalProfitUsd, input.totalEmissionsKg, demandMetUnits);

  return {
    mode: input.mode,
    status: "Optimal",
    total_profit_usd: Math.round(input.totalProfitUsd),
    optimization_objective_value: Math.round(input.totalProfitUsd - input.carbonOverageKg * 0.03),
    total_emissions_kg: Math.round(input.totalEmissionsKg),
    carbon_overage_kg: Math.round(input.carbonOverageKg),
    demand_met_units: Math.round(demandMetUnits),
    total_demand_units: Math.round(input.demandUnits),
    demand_met_pct: Number(input.demandMetPct.toFixed(1)),
    unmet_demand_total_units: Math.round(input.demandUnits - demandMetUnits),
    demand_shortfalls:
      input.demandMetPct < 100
        ? [{ product_id: "P2", unmet_units: Math.round(input.demandUnits - demandMetUnits) }]
        : [],
    relaxed_constraints:
      input.carbonOverageKg > 0
        ? [
            {
              constraint_name: "Global_Carbon_Cap",
              type: "carbon_cap",
              relaxed_by_kg: Math.round(input.carbonOverageKg),
            },
          ]
        : input.demandMetPct < 100
          ? [
              {
                constraint_name: "Demand_P2",
                type: "demand",
                product_id: "P2",
                relaxed_by_units: Math.round(input.demandUnits - demandMetUnits),
              },
            ]
          : [],
    production_plan: allocations,
    binding_constraints: [
      { constraint_name: input.carbonOverageKg > 0 ? "Soft_Global_Carbon_Cap" : "Hard_Global_Carbon_Cap", slack: 0, marginal_value: 42.8 },
      { constraint_name: "Capacity_factory_3", slack: 0, marginal_value: 18.4 },
    ],
  };
}

function createMockAllocations(totalProfitUsd: number, totalEmissionsKg: number, totalUnits: number): ProductionAllocation[] {
  const rows = [
    { facility_id: "factory_1", product_id: "P1", share: 0.28, emissionsPerUnit: 62 },
    { facility_id: "factory_2", product_id: "P2", share: 0.34, emissionsPerUnit: 180 },
    { facility_id: "factory_3", product_id: "P3", share: 0.38, emissionsPerUnit: 58 },
  ];

  return rows.map((row) => {
    const units = totalUnits * row.share;
    const emissions = totalEmissionsKg * row.share;
    const profit = totalProfitUsd * row.share;
    const productionEnergyEmissions = emissions * 0.68;
    const purchasedInputEmissions = emissions - productionEnergyEmissions;

    return {
      facility_id: row.facility_id,
      product_id: row.product_id,
      units_assigned: Math.round(units),
      profit_usd: Math.round(profit),
      emissions_kg: Math.round(emissions),
      production_energy_emissions_kg: Math.round(productionEnergyEmissions),
      purchased_input_emissions_kg: Math.round(purchasedInputEmissions),
      emissions_kg_per_unit: Number(row.emissionsPerUnit.toFixed(2)),
      production_energy_emissions_kg_per_unit: Number((row.emissionsPerUnit * 0.68).toFixed(2)),
      purchased_input_emissions_kg_per_unit: Number((row.emissionsPerUnit * 0.32).toFixed(2)),
    };
  });
}

function createMockParetoResponse(request: ParetoRequest): ParetoResponse {
  return {
    points: request.carbon_cap_kg_points.map((carbonCapKg) => {
      const solve = createMockSolveResponse({
        ...request.scenario,
        carbon_cap_kg: carbonCapKg,
      });
      const plan =
        solve.decision_status === "tradeoff_required" && solve.plans.protect_compliance
          ? solve.plans.protect_compliance
          : solve.plans.protect_demand;

      return {
        carbon_cap_kg: carbonCapKg,
        decision_status: solve.decision_status,
        profit_usd: plan.total_profit_usd ?? 0,
        total_emissions_kg: plan.total_emissions_kg ?? 0,
        demand_met_pct: plan.demand_met_pct ?? 0,
        carbon_overage_kg: plan.carbon_overage_kg ?? 0,
        unmet_demand_total_units: plan.unmet_demand_total_units ?? 0,
      };
    }),
  };
}
