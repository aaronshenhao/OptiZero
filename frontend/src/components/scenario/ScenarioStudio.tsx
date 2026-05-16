import { ScenarioSettings } from "./ScenarioSettings";
import { KPIGrid } from "./KPIGrid";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

// We'll mock the table UI component natively for brevity or inline it here.
function SimpleTable() {
  return (
    <div className="w-full overflow-auto rounded-md border mt-6">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Facility</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">P1 (Units)</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">P2 (Units)</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Total Output</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b transition-colors hover:bg-muted/50">
            <td className="p-4 align-middle font-medium">Factory A (Germany)</td>
            <td className="p-4 align-middle">4,500</td>
            <td className="p-4 align-middle text-muted-foreground">0</td>
            <td className="p-4 align-middle">4,500</td>
          </tr>
          <tr className="border-b transition-colors hover:bg-muted/50">
            <td className="p-4 align-middle font-medium">Factory B (Poland)</td>
            <td className="p-4 align-middle text-muted-foreground">0</td>
            <td className="p-4 align-middle">8,200</td>
            <td className="p-4 align-middle">8,200</td>
          </tr>
        </tbody>
      </table>
      <div className="p-4 text-center text-xs text-muted-foreground bg-muted/20">
         *The Plan Matrix visualizer is displaying mock structure. It will populate via the FastAPI `/solve` backend response later.
      </div>
    </div>
  )
}

export function ScenarioStudio() {
  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left Column: Inputs */}
      <div className="col-span-1 lg:col-span-1 h-full">
        <ScenarioSettings />
      </div>

      {/* Right Column: Outputs */}
      <div className="col-span-1 lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2 pb-4">
        <KPIGrid />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Plan Matrix (Reallocations)</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleTable />
            </CardContent>
          </Card>
          
          {/* Charts placeholders for "What Changed" */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Emissions by Factory</CardTitle>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center bg-muted/10 rounded-md border border-dashed">
              <span className="text-muted-foreground text-sm font-medium">(Recharts Bar Chart Placeholder)</span>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Total Output by Factory</CardTitle>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center bg-muted/10 rounded-md border border-dashed">
              <span className="text-muted-foreground text-sm font-medium">(Recharts Bar Chart Placeholder)</span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}