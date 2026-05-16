import { create } from "zustand";
import {
  buildScenarioPolicy,
  generateParetoFrontier,
  getSelectedPlan,
  kgToTons,
  solveScenario,
  tonsToKg,
  type DecisionStatus,
  type OptimizationPlan,
  type PlanMode,
  type ProductionAllocation,
  type SolveResponse,
} from "../services/optimizerApi";

export type FactoryAllocation = ProductionAllocation;

export type ParetoPoint = {
  carbonCap: number;
  demandProfit: number;
  demandTotalCO2: number;
  demandMet: number;
  demandCarbonOverage: number;
  demandUnmetDemandUnits: number;
  complianceProfit?: number;
  complianceTotalCO2?: number;
  complianceDemandMet?: number;
  complianceCarbonOverage?: number;
  complianceUnmetDemandUnits?: number;
  decisionStatus: DecisionStatus;
};

export type Scenario = {
  id: string;
  name: string;

  carbonCap: number;
  factoryOutage: number;
  demandSurge: number;
  allowUnmetDemand: boolean;
  maxOvertimePct: number;
  facilityCapacityMultipliers: Record<string, number>;
  demandMultiplier: number;

  decisionStatus: DecisionStatus;
  selectedPlanMode: PlanMode;
  solveResult?: SolveResponse;
  isSolving: boolean;
  solveError?: string;
  lastSolvedAt?: number;

  profit: number;
  totalCO2: number;
  capUtilization: number;
  demandMet: number;
  allocations: FactoryAllocation[];
  status: "Optimal" | "Infeasible";
  errorMessage?: string;

  paretoFrontier: ParetoPoint[];
  isParetoLoading: boolean;
  paretoError?: string;
  paretoUpdatedAt?: number;
};

const DEFAULT_FACILITY_SHOCK_ID = "factory_3";

const createDefaultScenario = (id: string, name: string): Scenario => ({
  id,
  name,
  carbonCap: 500000,
  factoryOutage: 0,
  demandSurge: 0,
  allowUnmetDemand: false,
  maxOvertimePct: 0,
  facilityCapacityMultipliers: { [DEFAULT_FACILITY_SHOCK_ID]: 1 },
  demandMultiplier: 1,
  decisionStatus: "optimal",
  selectedPlanMode: "protect_demand",
  isSolving: false,
  profit: 15400000,
  totalCO2: 450000,
  capUtilization: 90,
  demandMet: 100,
  allocations: [],
  status: "Optimal",
  paretoFrontier: [],
  isParetoLoading: false,
});

export type ScenarioState = {
  scenarios: Scenario[];
  activeScenarioId: string;

  addScenario: (name: string) => void;
  renameScenario: (id: string, newName: string) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string) => void;
  setSelectedPlanMode: (id: string, mode: PlanMode) => void;
  updateScenarioInputs: (id: string, inputs: Partial<Scenario>) => void;
  runSimulation: (id: string) => Promise<void>;
  generateParetoFrontier: (id: string) => Promise<void>;
};

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  scenarios: [createDefaultScenario("baseline-1", "Baseline 2026")],
  activeScenarioId: "baseline-1",

  addScenario: (name: string) => set((state) => {
    const newId = `scen-${Date.now()}`;
    const active = state.scenarios.find((scenario) => scenario.id === state.activeScenarioId);
    let newScenario = createDefaultScenario(newId, name);

    if (active) {
      newScenario = {
        ...newScenario,
        carbonCap: active.carbonCap,
        factoryOutage: active.factoryOutage,
        demandSurge: active.demandSurge,
        allowUnmetDemand: active.allowUnmetDemand,
        maxOvertimePct: active.maxOvertimePct,
        facilityCapacityMultipliers: { ...active.facilityCapacityMultipliers },
        demandMultiplier: active.demandMultiplier,
      };
    }

    return {
      scenarios: [...state.scenarios, newScenario],
      activeScenarioId: newId,
    };
  }),

  renameScenario: (id: string, newName: string) => set((state) => ({
    scenarios: state.scenarios.map((scenario) => (
      scenario.id === id ? { ...scenario, name: newName } : scenario
    )),
  })),

  deleteScenario: (id: string) => set((state) => {
    if (state.scenarios.length === 1) return state;

    const newScenarios = state.scenarios.filter((scenario) => scenario.id !== id);
    const newActiveId = state.activeScenarioId === id ? newScenarios[0].id : state.activeScenarioId;
    return { scenarios: newScenarios, activeScenarioId: newActiveId };
  }),

  setActiveScenario: (id: string) => set({ activeScenarioId: id }),

  setSelectedPlanMode: (id: string, mode: PlanMode) => set((state) => ({
    scenarios: state.scenarios.map((scenario) => {
      if (scenario.id !== id) return scenario;

      return applySelectedPlan({
        ...scenario,
        selectedPlanMode: mode,
      });
    }),
  })),

  updateScenarioInputs: (id: string, inputs: Partial<Scenario>) => set((state) => ({
    scenarios: state.scenarios.map((scenario) => {
      if (scenario.id !== id) return scenario;

      const next: Scenario = { ...scenario, ...inputs };

      if (inputs.factoryOutage !== undefined) {
        next.facilityCapacityMultipliers = {
          ...next.facilityCapacityMultipliers,
          [DEFAULT_FACILITY_SHOCK_ID]: Math.max(0, 1 - inputs.factoryOutage),
        };
      }

      if (inputs.demandSurge !== undefined) {
        next.demandMultiplier = 1 + inputs.demandSurge;
      }

      return next;
    }),
  })),

  runSimulation: async (id: string) => {
    const scenario = get().scenarios.find((item) => item.id === id);
    if (!scenario) return;

    set((state) => ({
      scenarios: state.scenarios.map((item) => (
        item.id === id ? { ...item, isSolving: true, solveError: undefined } : item
      )),
    }));

    try {
      const response = await solveScenario({
        dataset_id: "demo",
        scenario: buildScenarioPolicy(scenario),
      });

      set((state) => ({
        scenarios: state.scenarios.map((item) => {
          if (item.id !== id) return item;

          const selectedPlanMode = defaultPlanModeForResponse(response, item.allowUnmetDemand);
          return applySelectedPlan({
            ...item,
            decisionStatus: response.decision_status,
            selectedPlanMode,
            solveResult: response,
            isSolving: false,
            solveError: undefined,
            lastSolvedAt: Date.now(),
            status: response.decision_status === "infeasible" ? "Infeasible" : "Optimal",
            errorMessage: response.plans.protect_demand.error,
          });
        }),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run optimization.";

      set((state) => ({
        scenarios: state.scenarios.map((item) => (
          item.id === id
            ? {
                ...item,
                isSolving: false,
                solveError: message,
              }
            : item
        )),
      }));
    }
  },

  generateParetoFrontier: async (id: string) => {
    const scenario = get().scenarios.find((item) => item.id === id);
    if (!scenario) return;

    set((state) => ({
      scenarios: state.scenarios.map((item) => (
        item.id === id ? { ...item, isParetoLoading: true, paretoError: undefined } : item
      )),
    }));

    try {
      const capPointsTons = Array.from(new Set([
        50000,
        100000,
        150000,
        200000,
        250000,
        300000,
        400000,
        500000,
        650000,
        800000,
        1000000,
        scenario.carbonCap,
      ])).sort((a, b) => a - b);
      const { carbon_cap_kg: ignoredCarbonCapKg, ...paretoScenario } = buildScenarioPolicy(scenario);
      void ignoredCarbonCapKg;
      const response = await generateParetoFrontier({
        dataset_id: "demo",
        scenario: paretoScenario,
        carbon_cap_kg_points: capPointsTons.map(tonsToKg),
      });

      set((state) => ({
        scenarios: state.scenarios.map((item) => (
          item.id === id
            ? {
                ...item,
                paretoFrontier: response.points.map((point) => {
                  const compliancePoint =
                    point.compliance_fallback ??
                    (point.decision_status === "optimal"
                      ? {
                          profit_usd: point.profit_usd,
                          total_emissions_kg: point.total_emissions_kg,
                          demand_met_pct: point.demand_met_pct,
                          carbon_overage_kg: point.carbon_overage_kg,
                          unmet_demand_total_units: point.unmet_demand_total_units,
                        }
                      : undefined);

                  return {
                    carbonCap: kgToTons(point.carbon_cap_kg),
                    demandProfit: point.profit_usd,
                    demandTotalCO2: kgToTons(point.total_emissions_kg),
                    demandMet: point.demand_met_pct,
                    demandCarbonOverage: kgToTons(point.carbon_overage_kg),
                    demandUnmetDemandUnits: point.unmet_demand_total_units,
                    complianceProfit: compliancePoint?.profit_usd,
                    complianceTotalCO2: compliancePoint ? kgToTons(compliancePoint.total_emissions_kg) : undefined,
                    complianceDemandMet: compliancePoint?.demand_met_pct,
                    complianceCarbonOverage: compliancePoint ? kgToTons(compliancePoint.carbon_overage_kg) : undefined,
                    complianceUnmetDemandUnits: compliancePoint?.unmet_demand_total_units,
                    decisionStatus: point.decision_status,
                  };
                }).sort((a, b) => a.carbonCap - b.carbonCap),
                isParetoLoading: false,
                paretoUpdatedAt: Date.now(),
              }
            : item
        )),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate Pareto frontier.";

      set((state) => ({
        scenarios: state.scenarios.map((item) => (
          item.id === id
            ? {
                ...item,
                isParetoLoading: false,
                paretoError: message,
              }
            : item
        )),
      }));
    }
  },
}));

export function selectPlan(scenario: Scenario): OptimizationPlan | null {
  return getSelectedPlan(scenario.solveResult, scenario.selectedPlanMode);
}

function defaultPlanModeForResponse(response: SolveResponse, allowUnmetDemand: boolean): PlanMode {
  if (response.decision_status !== "tradeoff_required") return "protect_demand";
  return allowUnmetDemand && response.plans.protect_compliance ? "protect_compliance" : "protect_demand";
}

function applySelectedPlan(scenario: Scenario): Scenario {
  const selectedPlan = selectPlan(scenario);
  const carbonCapTons = scenario.carbonCap;

  if (!selectedPlan || selectedPlan.status !== "Optimal") {
    return {
      ...scenario,
      profit: 0,
      totalCO2: 0,
      capUtilization: 0,
      demandMet: 0,
      allocations: [],
      status: "Infeasible",
      errorMessage: selectedPlan?.error ?? scenario.errorMessage,
    };
  }

  const totalCO2 = kgToTons(selectedPlan.total_emissions_kg);

  return {
    ...scenario,
    profit: selectedPlan.total_profit_usd ?? 0,
    totalCO2,
    capUtilization: carbonCapTons > 0 ? Math.min(100, (totalCO2 / carbonCapTons) * 100) : 0,
    demandMet: selectedPlan.demand_met_pct ?? 0,
    allocations: selectedPlan.production_plan ?? [],
    status: "Optimal",
    errorMessage: undefined,
  };
}
