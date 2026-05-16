import { Sidebar } from "./Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Activity, BarChart3, Presentation, Download } from "lucide-react";
import { ScenarioStudio } from "../scenario/ScenarioStudio";
import { ParetoTradeoffTab } from "../scenario/ParetoTradeoffTab";

export function DashboardLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6 bg-card">
          <div className="font-semibold text-lg">Scenario Analysis</div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Tabs defaultValue="studio" className="flex flex-col h-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-4 mx-auto mb-6">
              <TabsTrigger value="studio" className="gap-2"><Activity className="h-4 w-4" /> Studio</TabsTrigger>
              <TabsTrigger value="pareto" className="gap-2"><BarChart3 className="h-4 w-4" /> Trade-offs</TabsTrigger>
              <TabsTrigger value="explain" className="gap-2"><Presentation className="h-4 w-4" /> Explainability</TabsTrigger>
              <TabsTrigger value="export" className="gap-2"><Download className="h-4 w-4" /> Exec Pack</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto rounded-xl border bg-card p-1">
              <TabsContent value="studio" className="h-full m-0 p-4 data-[state=active]:flex flex-col">
                <ScenarioStudio />
              </TabsContent>
              <TabsContent value="pareto" className="h-full m-0 p-4 data-[state=active]:block">
                <ParetoTradeoffTab />
              </TabsContent>
              <TabsContent value="explain">
                <div className="p-8 text-center text-muted-foreground tracking-tight font-medium">Explainability Tab (Coming Next)</div>
              </TabsContent>
              <TabsContent value="export">
                <div className="p-8 text-center text-muted-foreground tracking-tight font-medium">Executive Pack Tab (Coming Next)</div>
              </TabsContent>
            </div>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
