import { useScenarioStore } from "../../store/scenarioStore";
import { Card, CardContent } from "../ui/card";
import { DollarSign, CloudCog, Percent, PackageOpen } from "lucide-react";
import { cn } from "../../lib/utils";

export function KPIGrid() {
  const { scenarios, activeScenarioId } = useScenarioStore();
  const activeScenario = scenarios.find(s => s.id === activeScenarioId);
  const baseline = scenarios.find(s => s.id === "baseline-1") || scenarios[0]; // fallback to first

  if (!activeScenario) return null;

  const hasNoPlan = activeScenario.decisionStatus === "infeasible";

  const KPIs = [
    {
      label: "Profit",
      value: `$${(activeScenario.profit / 1000000).toFixed(2)}M`,
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      diff: activeScenario.profit - baseline.profit,
      formatDiff: (val: number) => `${val >= 0 ? '+' : '-'}$${Math.abs(val / 1000000).toFixed(2)}M`
    },
    {
      label: "Total CO₂",
      value: `${(activeScenario.totalCO2 / 1000).toFixed(0)}k tons`,
      icon: CloudCog,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      diff: activeScenario.totalCO2 - baseline.totalCO2,
      formatDiff: (val: number) => `${val >= 0 ? '+' : '-'}${Math.abs(val / 1000).toFixed(0)}k t`
    },
    {
      label: "Cap Utilization",
      value: `${activeScenario.capUtilization.toFixed(1)}%`,
      icon: Percent,
      color: activeScenario.capUtilization > 95 ? "text-orange-500" : "text-purple-500",
      bg: activeScenario.capUtilization > 95 ? "bg-orange-500/10" : "bg-purple-500/10",
      diff: activeScenario.capUtilization - baseline.capUtilization,
      formatDiff: (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
    },
    {
      label: "Demand Met",
      value: `${activeScenario.demandMet.toFixed(1)}%`,
      icon: PackageOpen,
      color: activeScenario.demandMet < 100 ? "text-destructive" : "text-primary",
      bg: activeScenario.demandMet < 100 ? "bg-destructive/10" : "bg-primary/10",
      diff: activeScenario.demandMet - baseline.demandMet,
      formatDiff: (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {KPIs.map((kpi, i) => (
        <Card key={i}>
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
              <div className={cn("p-2 rounded-full", kpi.bg)}>
                <kpi.icon className={cn("h-4 w-4", kpi.color)} />
              </div>
            </div>
            <div className="flex items-end justify-between">
              <h3 className={cn("text-2xl font-bold tracking-tight", hasNoPlan && "opacity-50 line-through")}>
                {activeScenario.isSolving ? "Solving..." : hasNoPlan ? "N/A" : kpi.value}
              </h3>
            </div>
            <div className="mt-2 text-xs text-muted-foreground font-medium">
              {activeScenario.id === baseline.id ? (
                <span>Baseline</span>
              ) : activeScenario.solveError ? (
                <span className="text-destructive font-semibold">Using mock fallback</span>
              ) : hasNoPlan ? (
                <span className="text-destructive font-semibold">Constraint Failed</span>
              ) : activeScenario.decisionStatus === "tradeoff_required" ? (
                <span className="text-orange-600 font-semibold">
                  {activeScenario.selectedPlanMode === "protect_compliance" ? "Compliance plan" : "Demand plan"}
                </span>
              ) : (
                <span className={cn(
                  kpi.diff > 0 && kpi.label !== "Total CO₂" ? "text-emerald-500" : 
                  kpi.diff < 0 && kpi.label === "Total CO₂" ? "text-emerald-500" : 
                  kpi.diff !== 0 ? "text-destructive" : ""
                )}>
                  {kpi.formatDiff(kpi.diff)} vs baseline
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
