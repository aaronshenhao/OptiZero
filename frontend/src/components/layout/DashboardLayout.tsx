import { Sidebar } from "./Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Activity, BarChart3, Presentation, Download, AlertTriangle } from "lucide-react";
import { ScenarioStudio } from "../scenario/ScenarioStudio";
import { ParetoTradeoffTab } from "../scenario/ParetoTradeoffTab";
import { ExplainabilityTab } from "../scenario/ExplainabilityTab";
import { Button } from "../ui/button";
import { useScenarioStore } from "../../store/scenarioStore";
import { type PlanMode } from "../../services/optimizerApi";

export function DashboardLayout() {
  const { scenarios, activeScenarioId, setSelectedPlanMode } = useScenarioStore();
  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId);
  const canComparePlans =
    activeScenario?.decisionStatus === "tradeoff_required" &&
    !!activeScenario.solveResult?.plans.protect_compliance;

  const handlePlanModeChange = (mode: PlanMode) => {
    if (!activeScenario) return;
    setSelectedPlanMode(activeScenario.id, mode);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <Tabs defaultValue="studio" className="flex h-full min-h-0 flex-col">
            <div className="grid min-h-14 shrink-0 grid-cols-1 gap-2 border-b bg-card px-4 py-2 lg:px-6 xl:grid-cols-[1fr_auto_1fr] xl:items-center">
              <div className="hidden min-w-0 xl:block">
                <div className="truncate text-sm font-semibold">{activeScenario?.name ?? "Scenario Analysis"}</div>
                <div className="text-xs text-muted-foreground">Scenario Analysis</div>
              </div>

              <TabsList className="grid h-9 w-full grid-cols-4 justify-self-center xl:col-start-2 xl:w-[42rem]">
                <TabsTrigger value="studio" className="h-7 gap-2"><Activity className="h-4 w-4" /> Studio</TabsTrigger>
                <TabsTrigger value="pareto" className="h-7 gap-2"><BarChart3 className="h-4 w-4" /> Trade-offs</TabsTrigger>
                <TabsTrigger value="explain" className="h-7 gap-2"><Presentation className="h-4 w-4" /> Explainability</TabsTrigger>
                <TabsTrigger value="export" className="h-7 gap-2"><Download className="h-4 w-4" /> Exec Pack</TabsTrigger>
              </TabsList>

              {canComparePlans && (
                <PlanModeSwitcher
                  selectedMode={activeScenario.selectedPlanMode}
                  onChange={handlePlanModeChange}
                />
              )}
            </div>

            <TabsContent value="studio" className="m-0 min-h-0 flex-1 overflow-hidden p-4 pb-0 lg:p-6 lg:pb-0 data-[state=active]:flex">
              <ScenarioStudio />
            </TabsContent>
            <TabsContent value="pareto" className="m-0 min-h-0 flex-1 overflow-auto p-4 lg:p-6 data-[state=active]:block">
              <ParetoTradeoffTab />
            </TabsContent>
            <TabsContent value="explain" className="m-0 min-h-0 flex-1 overflow-auto p-4 lg:p-6 data-[state=active]:block">
              <ExplainabilityTab />
            </TabsContent>
            <TabsContent value="export" className="m-0 min-h-0 flex-1 overflow-auto p-4 lg:p-6 data-[state=active]:block">
              <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-muted-foreground tracking-tight font-medium">
                Executive Pack Tab (Coming Next)
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

function PlanModeSwitcher({
  selectedMode,
  onChange,
}: {
  selectedMode: PlanMode;
  onChange: (mode: PlanMode) => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-2 sm:w-auto xl:justify-self-end">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-700">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-600" />
        <span>Trade-off</span>
      </div>

      <div className="flex h-9 shrink-0 rounded-md bg-muted p-1">
        <Button
          size="sm"
          variant={selectedMode === "protect_demand" ? "default" : "ghost"}
          className="h-7 px-2.5 text-xs shadow-none"
          onClick={() => onChange("protect_demand")}
        >
          Protect Demand
        </Button>
        <Button
          size="sm"
          variant={selectedMode === "protect_compliance" ? "default" : "ghost"}
          className="h-7 px-2.5 text-xs shadow-none"
          onClick={() => onChange("protect_compliance")}
        >
          Protect Compliance
        </Button>
      </div>
    </div>
  );
}
