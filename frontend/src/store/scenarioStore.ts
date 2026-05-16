import { create } from "zustand";
import { generateParetoFrontierMock, solveScenarioMock } from "../services/optimizerApi";

export type FactoryAllocation = {
  facility_id: string;
  product_id: string;
  units_assigned: number;
};

export type ParetoPoint = {
  carbonCap: number;
  profit: number;
  totalCO2: number;
  status: "Optimal" | "Infeasible";
};

export type Scenario = {
  id: string;
  name: string;
  // Inputs
  carbonCap: number; // tons
  factoryOutage: number; // 0 to 1 scaling (e.g. 0.3 = 30% drop)
  demandSurge: number; // 0 to 1 scaling
  allowUnmetDemand: boolean;
  
  // Results
  profit: number;
  totalCO2: number;
  capUtilization: number;
  demandMet: number;
  allocations: FactoryAllocation[];
  status: "Optimal" | "Infeasible";
  errorMessage?: string;
  paretoFrontier: ParetoPoint[];
  paretoUpdatedAt?: number;
};

const createDefaultScenario = (id: string, name: string): Scenario => ({
  id,
  name,
  carbonCap: 500000,
  factoryOutage: 0,
  demandSurge: 0,
  allowUnmetDemand: false,
  profit: 15400000,
  totalCO2: 450000,
  capUtilization: 90,
  demandMet: 100,
  allocations: [],
  status: "Optimal",
  paretoFrontier: [],
});

export type ScenarioState = {
  scenarios: Scenario[];
  activeScenarioId: string;
  
  // Actions
  addScenario: (name: string) => void;
  renameScenario: (id: string, newName: string) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string) => void;
  updateScenarioInputs: (id: string, inputs: Partial<Scenario>) => void;
  runSimulation: (id: string) => void; 
  generateParetoFrontier: (id: string) => void;
};

export const useScenarioStore = create<ScenarioState>((set) => ({
  scenarios: [createDefaultScenario("baseline-1", "Baseline 2026")],
  activeScenarioId: "baseline-1",

  addScenario: (name: string) => set((state) => {
    const newId = `scen-${Date.now()}`;
    const active = state.scenarios.find(s => s.id === state.activeScenarioId);
    let newScenario = createDefaultScenario(newId, name);
    if (active) {
      newScenario = {
        ...newScenario,
        carbonCap: active.carbonCap,
        factoryOutage: active.factoryOutage,
        demandSurge: active.demandSurge,
        allowUnmetDemand: active.allowUnmetDemand,
      };
    }
    return {
      scenarios: [...state.scenarios, newScenario],
      activeScenarioId: newId,
    };
  }),

  renameScenario: (id: string, newName: string) => set((state) => ({
    scenarios: state.scenarios.map(s => s.id === id ? { ...s, name: newName } : s)
  })),

  deleteScenario: (id: string) => set((state) => {
    if (state.scenarios.length === 1) return state; // don't delete last one
    const newScenarios = state.scenarios.filter(s => s.id !== id);
    const newActiveId = state.activeScenarioId === id ? newScenarios[0].id : state.activeScenarioId;
    return { scenarios: newScenarios, activeScenarioId: newActiveId };
  }),

  setActiveScenario: (id: string) => set({ activeScenarioId: id }),

  updateScenarioInputs: (id: string, inputs: Partial<Scenario>) => set((state) => ({
    scenarios: state.scenarios.map(s => s.id === id ? { ...s, ...inputs } : s)
  })),

  runSimulation: (id: string) => set((state) => {
    return {
      scenarios: state.scenarios.map(s => {
        if (s.id !== id) return s;
        
        const result = solveScenarioMock(s);
        
        return {
          ...s,
          ...result,
        };
      })
    };
  }),

  generateParetoFrontier: (id: string) => set((state) => ({
    scenarios: state.scenarios.map((scenario) => {
      if (scenario.id !== id) return scenario;

      return {
        ...scenario,
        paretoFrontier: generateParetoFrontierMock(scenario),
        paretoUpdatedAt: Date.now(),
      };
    }),
  })),
}));
