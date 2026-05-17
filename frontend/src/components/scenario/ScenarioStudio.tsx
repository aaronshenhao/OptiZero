import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ScenarioSettings } from "./ScenarioSettings";
import { KPIGrid } from "./KPIGrid";
import { selectPlan, useScenarioStore } from "../../store/scenarioStore";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { cn } from "../../lib/utils";
import { fetchDemoData, kgToTons, type DemoDataResponse } from "../../services/optimizerApi";

export function ScenarioStudio() {
  const { scenarios, activeScenarioId } = useScenarioStore();
  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId);
  const selectedPlan = activeScenario ? selectPlan(activeScenario) : null;
  const [demoData, setDemoData] = useState<DemoDataResponse | null>(null);

  useEffect(() => {
    fetchDemoData().then(setDemoData).catch(() => setDemoData(null));
  }, []);

  if (!activeScenario) return null;

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 gap-6 lg:grid-cols-4">
      <div className="col-span-1 min-h-0 lg:col-span-1">
        <ScenarioSettings />
      </div>

      <div className="col-span-1 flex min-h-0 flex-col gap-6 overflow-y-auto pb-4 pr-2 lg:col-span-3">
        <KPIGrid />

        {activeScenario.solveError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Optimizer request failed</div>
                <p className="mt-1 text-xs opacity-90">{activeScenario.solveError}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {activeScenario.decisionStatus === "tradeoff_required" && activeScenario.solveResult?.tradeoff_summary && (
          <TradeoffBanner
            carbonGapTons={kgToTons(activeScenario.solveResult.tradeoff_summary.carbon_gap_kg_if_demand_protected)}
            unmetDemandUnits={activeScenario.solveResult.tradeoff_summary.unmet_demand_units_if_compliance_protected}
            profitDeltaUsd={activeScenario.solveResult.tradeoff_summary.profit_delta_usd_if_compliance_protected}
          />
        )}

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plan Matrix (Selected Plan)</CardTitle>
            </CardHeader>
            <CardContent>
              <PlanMatrix selectedPlan={selectedPlan} demoData={demoData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

type TradeoffBannerProps = {
  carbonGapTons: number;
  unmetDemandUnits: number;
  profitDeltaUsd: number;
};

function TradeoffBanner({ carbonGapTons, unmetDemandUnits, profitDeltaUsd }: TradeoffBannerProps) {
  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
        <div className="space-y-2">
          <div className="font-semibold text-orange-800">Carbon compliance trade-off required</div>
          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
            <MetricPill label="Demand plan carbon gap" value={`${carbonGapTons.toLocaleString()} t`} />
            <MetricPill label="Compliance plan unmet demand" value={`${unmetDemandUnits.toLocaleString()} units`} />
            <MetricPill
              label="Compliance profit delta"
              value={`${profitDeltaUsd < 0 ? "-" : "+"}$${Math.abs(profitDeltaUsd / 1000000).toFixed(2)}M`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/70 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold text-foreground">{value}</div>
    </div>
  );
}

function PlanMatrix({ selectedPlan, demoData }: { selectedPlan: ReturnType<typeof selectPlan>; demoData: DemoDataResponse | null }) {
  const allocations = selectedPlan?.production_plan ?? [];

  if (!selectedPlan || selectedPlan.status !== "Optimal") {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {selectedPlan?.error ?? "No feasible production plan is available for the current constraints."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Facility</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Profit</TableHead>
            <TableHead className="text-right">CO2e</TableHead>
            <TableHead className="text-right">Energy CO2e</TableHead>
            <TableHead className="text-right">Input CO2e</TableHead>
            <TableHead className="text-right">CO2e / Unit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((allocation) => (
            <TableRow key={`${allocation.facility_id}-${allocation.product_id}`}>
              <TableCell>
                <div className="font-medium">{getFacilityName(allocation.facility_id, demoData)}</div>
                <div className="text-xs text-muted-foreground">{allocation.facility_id}</div>
              </TableCell>
              <TableCell>{allocation.product_id}</TableCell>
              <TableCell className="text-right">{allocation.units_assigned.toLocaleString()}</TableCell>
              <TableCell className="text-right">${(allocation.profit_usd / 1000000).toFixed(2)}M</TableCell>
              <TableCell className="text-right">{kgToTons(allocation.emissions_kg).toLocaleString()} t</TableCell>
              <TableCell className="text-right">
                {kgToTons(allocation.production_energy_emissions_kg).toLocaleString()} t
              </TableCell>
              <TableCell className="text-right">
                {kgToTons(allocation.purchased_input_emissions_kg).toLocaleString()} t
              </TableCell>
              <TableCell className="text-right">{allocation.emissions_kg_per_unit.toFixed(1)} kg</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center gap-2 border-t bg-muted/20 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className={cn("h-4 w-4", selectedPlan.mode === "protect_compliance" ? "text-primary" : "text-emerald-600")} />
        Showing the selected `{selectedPlan.mode}` solver plan from the backend-shaped response.
      </div>
    </div>
  );
}

function getFacilityName(facilityId: string, demoData: DemoDataResponse | null) {
  return demoData?.facilities.find((facility) => facility.id === facilityId)?.name ?? facilityId;
}
