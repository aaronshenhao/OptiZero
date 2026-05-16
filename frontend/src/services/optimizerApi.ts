import type { ParetoPoint, Scenario } from "../store/scenarioStore";

export type OptimizerResult = Pick<
  Scenario,
  "profit" | "totalCO2" | "capUtilization" | "demandMet" | "status" | "errorMessage"
>;

const BASE_PROFIT_USD = 15400000;
const BASE_CO2_TONS = 450000;
const MINIMUM_FEASIBLE_CAP_TONS = 150000;

export function solveScenarioMock(scenario: Scenario): OptimizerResult {
  let status: Scenario["status"] = "Optimal";
  let errorMessage: string | undefined;

  if (scenario.carbonCap < MINIMUM_FEASIBLE_CAP_TONS && !scenario.allowUnmetDemand && scenario.demandSurge > 0.1) {
    status = "Infeasible";
    errorMessage = "Carbon cap too tight to meet minimum demand.";
  }

  const profit = Math.max(
    0,
    BASE_PROFIT_USD - (500000 - scenario.carbonCap) * 15 - scenario.factoryOutage * 2000000
  );
  const totalCO2 = Math.min(scenario.carbonCap, BASE_CO2_TONS * (1 - scenario.factoryOutage));

  if (status === "Infeasible") {
    return {
      status,
      errorMessage,
      profit: 0,
      totalCO2: 0,
      capUtilization: 0,
      demandMet: 0,
    };
  }

  return {
    status,
    errorMessage,
    profit,
    totalCO2,
    capUtilization: Math.min(100, Math.max(0, (totalCO2 / scenario.carbonCap) * 100)),
    demandMet: scenario.factoryOutage > 0.2 && !scenario.allowUnmetDemand ? 92 : 100,
  };
}

export function generateParetoFrontierMock(scenario: Scenario): ParetoPoint[] {
  const capPoints = [
    50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 650000, 800000, 1000000,
  ];

  return capPoints.map((carbonCap) => {
    const result = solveScenarioMock({ ...scenario, carbonCap });

    return {
      carbonCap,
      profit: result.profit,
      totalCO2: result.totalCO2,
      status: result.status,
    };
  });
}
