import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Factory,
  Gauge,
  Lightbulb,
  Scale,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { selectPlan, useScenarioStore } from "../../store/scenarioStore";
import {
  fetchDemoData,
  kgToTons,
  type DemoDataResponse,
  type ExplainabilityRecommendation,
  type OptimizationPlan,
  type ProductionAllocation,
  type RelaxedConstraint,
} from "../../services/optimizerApi";
import { cn } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type FacilityUtilization = {
  facilityId: string;
  facilityName: string;
  usedHours: number;
  availableHours: number;
  utilizationPct: number;
  status: "Binding" | "Tight" | "Available";
};

type RouteRationale = ProductionAllocation & {
  facilityName: string;
  productName: string;
  profitPerHour: number;
  hoursUsed: number;
};

export function ExplainabilityTab() {
  const { scenarios, activeScenarioId, generateExplainability } = useScenarioStore();
  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId);
  const selectedPlan = activeScenario ? selectPlan(activeScenario) : null;
  const [demoData, setDemoData] = useState<DemoDataResponse | null>(null);
  const activeId = activeScenario?.id;
  const carbonCap = activeScenario?.carbonCap;
  const factoryOutage = activeScenario?.factoryOutage;
  const demandSurge = activeScenario?.demandSurge;
  const allowUnmetDemand = activeScenario?.allowUnmetDemand;
  const maxOvertimePct = activeScenario?.maxOvertimePct;

  useEffect(() => {
    fetchDemoData().then(setDemoData).catch(() => setDemoData(null));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const timer = setTimeout(() => {
      generateExplainability(activeId);
    }, 300);
    return () => clearTimeout(timer);
  }, [
    activeId,
    carbonCap,
    factoryOutage,
    demandSurge,
    allowUnmetDemand,
    maxOvertimePct,
    generateExplainability,
  ]);

  const facilityUtilization = useMemo(
    () => buildFacilityUtilization(selectedPlan, activeScenario, demoData),
    [activeScenario, demoData, selectedPlan]
  );

  const routeRationale = useMemo(
    () => buildRouteRationale(selectedPlan, demoData),
    [demoData, selectedPlan]
  );

  const watchlist = useMemo(
    () => buildWatchlist(selectedPlan),
    [selectedPlan]
  );

  if (!activeScenario) return null;

  const explainResult = activeScenario.explainResult;
  const tradeoffSummary = activeScenario.solveResult?.tradeoff_summary;
  const compliancePlan = activeScenario.solveResult?.plans.protect_compliance;
  const hasPlan = selectedPlan?.status === "Optimal";
  const hasSelectedPlanRisk = hasRisk(selectedPlan, activeScenario.decisionStatus);
  const sensitivityData = explainResult ? [
    ...explainResult.capacity_sensitivities.map((item) => ({
      name: labelFacility(item.facility_id, demoData),
      lift: item.profit_delta_usd,
      type: "Capacity",
    })),
    ...explainResult.carbon_sensitivities.map((item) => ({
      name: `Cap +${item.relaxation_pct}%`,
      lift: item.profit_delta_usd,
      type: "Carbon",
    })),
    ...(explainResult.overtime_sensitivity
      ? [{
          name: `OT +${explainResult.overtime_sensitivity.added_overtime_pct}%`,
          lift: explainResult.overtime_sensitivity.profit_delta_usd,
          type: "Overtime",
        }]
      : []),
  ].sort((a, b) => b.lift - a.lift).slice(0, 7) : [];

  return (
    <div className="grid h-full grid-cols-1 gap-6 xl:grid-cols-4">
      <div className="space-y-6 xl:col-span-1">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Explainability</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Turns solver outputs into the bottlenecks, risks, and levers an executive can act on.
          </p>
        </div>

        <DecisionBrief
          scenarioStatus={activeScenario.decisionStatus}
          selectedPlan={selectedPlan}
          tradeoffSummary={tradeoffSummary}
          isLoading={activeScenario.isExplainLoading}
        />

        <Recommendations
          recommendations={explainResult?.recommendations ?? []}
          isLoading={activeScenario.isExplainLoading}
          error={activeScenario.explainError}
        />
      </div>

      <div className="space-y-6 xl:col-span-3">
        {activeScenario.explainError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Explainability request failed</div>
                <p className="mt-1 text-xs opacity-90">{activeScenario.explainError}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
          <ConstraintWatchlist constraints={watchlist} hasPlan={hasPlan} />
          <SensitivityChart data={sensitivityData} isLoading={activeScenario.isExplainLoading} />
        </div>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
          <OperatingBottlenecks rows={facilityUtilization} hasPlan={hasPlan} />
          <TradeoffExplanation
            selectedPlan={selectedPlan}
            compliancePlan={compliancePlan}
            tradeoffSummary={tradeoffSummary}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
          {hasSelectedPlanRisk && <RiskPanel selectedPlan={selectedPlan} scenarioStatus={activeScenario.decisionStatus} />}
          <div className={cn(!hasSelectedPlanRisk && "2xl:col-span-2")}>
            <RouteRationaleTable rows={routeRationale} hasPlan={hasPlan} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionBrief({
  scenarioStatus,
  selectedPlan,
  tradeoffSummary,
  isLoading,
}: {
  scenarioStatus: string;
  selectedPlan: OptimizationPlan | null;
  tradeoffSummary: { carbon_gap_kg_if_demand_protected: number; unmet_demand_units_if_compliance_protected: number; profit_delta_usd_if_compliance_protected: number } | null | undefined;
  isLoading: boolean;
}) {
  const verdict = getExecutiveVerdict(scenarioStatus, selectedPlan, tradeoffSummary);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-primary">
          <Scale className="h-4 w-4" />
          Executive Decision Brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium leading-6">{isLoading ? "Refreshing explanation from optimizer..." : verdict}</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <BriefMetric label="Plan mode" value={selectedPlan?.mode ? readableMode(selectedPlan.mode) : "No plan"} />
          <BriefMetric label="Solver status" value={selectedPlan?.status ?? "Pending"} />
          <BriefMetric label="Demand met" value={`${(selectedPlan?.demand_met_pct ?? 0).toFixed(1)}%`} />
          <BriefMetric label="Carbon overage" value={`${kgToTons(selectedPlan?.carbon_overage_kg).toLocaleString()} t`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Recommendations({
  recommendations,
  isLoading,
  error,
}: {
  recommendations: ExplainabilityRecommendation[];
  isLoading: boolean;
  error?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Next Best Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <EmptyState text="Testing investment levers..." />}
        {!isLoading && error && <EmptyState text="Using the current solve only until explainability is available." />}
        {!isLoading && !error && recommendations.length === 0 && <EmptyState text="No material intervention is recommended for this scenario." />}
        {!isLoading && recommendations.map((item) => (
          <div key={`${item.label}-${item.target}`} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{item.title}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.rationale}</p>
              </div>
              <StatusPill improved={item.decision_status_improved} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <BriefMetric label="Profit lift" value={formatMoney(item.profit_delta_usd)} />
              <BriefMetric label="Demand lift" value={`${formatSigned(item.demand_met_delta_pct)} pts`} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConstraintWatchlist({ constraints, hasPlan }: { constraints: ReturnType<typeof buildWatchlist>; hasPlan: boolean }) {
  const status = getWatchlistStatus(constraints.length, hasPlan);

  return (
    <Card>
      <CardHeader className={cn(constraints.length === 0 && hasPlan && "pb-3")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Constraint Watchlist
          </CardTitle>
          <span className={cn("w-fit rounded-full px-2.5 py-1 text-xs font-semibold", status.className)}>
            {status.label}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {!hasPlan ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Loosen demand, capacity, or carbon constraints to recover a feasible operating plan.
          </p>
        ) : constraints.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Current plan has no material capacity, carbon, or demand constraints with measurable economic impact.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Constraint</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Slack</TableHead>
                  <TableHead className="text-right">Marginal Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {constraints.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.meaning}</div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2 py-1 text-xs font-medium", groupBadgeClass(item.group))}>
                        {item.group}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatConstraintSlack(item)}</TableCell>
                    <TableCell className="text-right">{formatMoney(item.marginalValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getWatchlistStatus(constraintCount: number, hasPlan: boolean) {
  if (!hasPlan) {
    return {
      label: "Scenario infeasible",
      className: "bg-destructive/10 text-destructive",
    };
  }

  if (constraintCount === 0) {
    return {
      label: "No active bottlenecks detected",
      className: "bg-emerald-500/10 text-emerald-700",
    };
  }

  return {
    label: `${constraintCount} active bottleneck${constraintCount === 1 ? "" : "s"}`,
    className: "bg-orange-500/10 text-orange-700",
  };
}

function SensitivityChart({ data, isLoading }: { data: Array<{ name: string; lift: number; type: string }>; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-emerald-600" />
          Investment Sensitivity
        </CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        {isLoading || data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
            {isLoading ? "Re-solving lever scenarios..." : "No sensitivity data yet."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 36, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.35} />
              <XAxis type="number" tickFormatter={formatMoneyShort} />
              <YAxis dataKey="name" type="category" width={92} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [formatMoney(Number(value)), "Profit lift"]} labelFormatter={(label) => `${label}`} />
              <Bar dataKey="lift" fill="#059669" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function OperatingBottlenecks({ rows, hasPlan }: { rows: FacilityUtilization[]; hasPlan: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Factory className="h-5 w-5 text-blue-600" />
          Operating Bottlenecks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasPlan || rows.length === 0 ? (
          <EmptyState text="Run a feasible scenario to see capacity utilization." />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.facilityId} className="rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{row.facilityName}</span>
                  <span className={cn("rounded-full px-2 py-1 text-xs font-medium", utilizationBadgeClass(row.status))}>{row.status}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-muted">
                  <div
                    className={cn("h-2 rounded-full", row.utilizationPct >= 98 ? "bg-orange-500" : row.utilizationPct >= 85 ? "bg-blue-500" : "bg-emerald-500")}
                    style={{ width: `${Math.min(100, row.utilizationPct)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{row.utilizationPct.toFixed(1)}% utilized</span>
                  <span>{Math.round(row.usedHours).toLocaleString()} / {Math.round(row.availableHours).toLocaleString()} hrs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TradeoffExplanation({
  selectedPlan,
  compliancePlan,
  tradeoffSummary,
}: {
  selectedPlan: OptimizationPlan | null;
  compliancePlan?: OptimizationPlan | null;
  tradeoffSummary?: { carbon_gap_kg_if_demand_protected: number; unmet_demand_units_if_compliance_protected: number; profit_delta_usd_if_compliance_protected: number } | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Trade-off Explanation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!tradeoffSummary ? (
          <div className="flex items-start gap-3 rounded-md border bg-emerald-500/5 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-semibold">No compliance trade-off at this cap</div>
              <p className="mt-1 text-muted-foreground">The selected plan can satisfy demand without exceeding the active carbon constraint.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Full-demand operations exceed the cap by {kgToTons(tradeoffSummary.carbon_gap_kg_if_demand_protected).toLocaleString()} t. The compliance-protected plan respects the cap but leaves {tradeoffSummary.unmet_demand_units_if_compliance_protected.toLocaleString()} units unmet.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <BriefMetric label="Selected plan" value={selectedPlan?.mode ? readableMode(selectedPlan.mode) : "No plan"} />
              <BriefMetric label="Compliance demand" value={`${(compliancePlan?.demand_met_pct ?? 0).toFixed(1)}%`} />
              <BriefMetric label="Profit delta" value={formatMoney(tradeoffSummary.profit_delta_usd_if_compliance_protected)} />
              <BriefMetric label="Carbon overage" value={`${kgToTons(compliancePlan?.carbon_overage_kg).toLocaleString()} t`} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RiskPanel({ selectedPlan, scenarioStatus }: { selectedPlan: OptimizationPlan | null; scenarioStatus: string }) {
  const relaxed = selectedPlan?.relaxed_constraints ?? [];
  const shortfalls = selectedPlan?.demand_shortfalls ?? [];
  const carbonOverage = selectedPlan?.carbon_overage_kg ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Demand and Compliance Risks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {scenarioStatus === "infeasible" && <RiskRow title="Infeasible scenario" detail={selectedPlan?.error ?? "The hard constraints cannot produce a valid plan."} />}
        {carbonOverage > 0 && <RiskRow title="Carbon compliance gap" detail={`${kgToTons(carbonOverage).toLocaleString()} t above the active cap if demand is protected.`} />}
        {shortfalls.map((item) => (
          <RiskRow key={item.product_id} title={`Demand shortfall: ${item.product_id}`} detail={`${item.unmet_units.toLocaleString()} units unmet under compliance protection.`} />
        ))}
        {relaxed.map((item) => (
          <RiskRow key={item.constraint_name} title={readableRelaxedConstraint(item)} detail="The solver had to relax this business guardrail to produce the selected plan." />
        ))}
      </CardContent>
    </Card>
  );
}

function RouteRationaleTable({ rows, hasPlan }: { rows: RouteRationale[]; hasPlan: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gauge className="h-5 w-5 text-slate-700" />
          Why Production Moved Here
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasPlan || rows.length === 0 ? (
          <EmptyState text="A feasible production plan is needed to explain route choices." />
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Profit / Labor Hr</TableHead>
                  <TableHead className="text-right">CO2e / Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 6).map((row) => (
                  <TableRow key={`${row.facility_id}-${row.product_id}`}>
                    <TableCell>
                      <div className="font-medium">{row.productName}</div>
                      <div className="text-xs text-muted-foreground">{row.facilityName}</div>
                    </TableCell>
                    <TableCell className="text-right">{row.units_assigned.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatMoneyPerHour(row.profitPerHour)}</TableCell>
                    <TableCell className="text-right">{row.emissions_kg_per_unit.toFixed(1)} kg</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BriefMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/70 p-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function RiskRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border bg-destructive/5 p-3 text-sm">
      <div className="font-semibold text-destructive">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusPill({ improved }: { improved: boolean }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-1 text-xs font-semibold", improved ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>
      {improved ? "Improves status" : "Financial lever"}
    </span>
  );
}

function buildWatchlist(selectedPlan: OptimizationPlan | null) {
  const demandHasIssue =
    (selectedPlan?.demand_met_pct ?? 100) < 99.99 ||
    (selectedPlan?.demand_shortfalls?.length ?? 0) > 0 ||
    (selectedPlan?.relaxed_constraints ?? []).some((item) => item.type === "demand");

  return (selectedPlan?.binding_constraints ?? [])
    .map((constraint) => {
      const group = constraintGroup(constraint.constraint_name);
      return {
        name: constraint.constraint_name,
        label: readableConstraintName(constraint.constraint_name),
        group,
        slack: constraint.slack,
        marginalValue: constraint.marginal_value,
        meaning: constraintMeaning(constraint.constraint_name, group),
      };
    })
    .filter((item) => item.group !== "Demand" || demandHasIssue)
    .filter((item) => hasConstraintSignal(item.slack, item.marginalValue))
    .sort((a, b) => Math.abs(b.marginalValue) - Math.abs(a.marginalValue));
}

function hasConstraintSignal(slack: number, marginalValue: number) {
  const slackEpsilon = 0.005;
  const moneyDisplayEpsilon = 5000;
  return Math.abs(slack) > slackEpsilon || Math.abs(marginalValue) >= moneyDisplayEpsilon;
}

function hasRisk(selectedPlan: OptimizationPlan | null, scenarioStatus: string) {
  return (
    scenarioStatus === "infeasible" ||
    (selectedPlan?.relaxed_constraints?.length ?? 0) > 0 ||
    (selectedPlan?.demand_shortfalls?.length ?? 0) > 0 ||
    (selectedPlan?.carbon_overage_kg ?? 0) > 0
  );
}

function buildFacilityUtilization(
  selectedPlan: OptimizationPlan | null,
  activeScenario: { maxOvertimePct: number; facilityCapacityMultipliers: Record<string, number> } | undefined,
  demoData: DemoDataResponse | null
): FacilityUtilization[] {
  if (!selectedPlan?.production_plan || !demoData || !activeScenario) return [];

  const usedHours = new Map<string, number>();
  selectedPlan.production_plan.forEach((allocation) => {
    const route = demoData.routes.find((item) => item.facility_id === allocation.facility_id && item.product_id === allocation.product_id);
    const hours = allocation.units_assigned * (route?.hours_per_unit ?? 0);
    usedHours.set(allocation.facility_id, (usedHours.get(allocation.facility_id) ?? 0) + hours);
  });

  return demoData.facilities.map((facility) => {
    const multiplier = activeScenario.facilityCapacityMultipliers[facility.id] ?? 1;
    const availableHours = facility.max_operating_hours * (1 + activeScenario.maxOvertimePct / 100) * multiplier;
    const hours = usedHours.get(facility.id) ?? 0;
    const utilizationPct = availableHours > 0 ? (hours / availableHours) * 100 : 0;
    const status: FacilityUtilization["status"] = utilizationPct >= 98 ? "Binding" : utilizationPct >= 85 ? "Tight" : "Available";
    return {
      facilityId: facility.id,
      facilityName: facility.name,
      usedHours: hours,
      availableHours,
      utilizationPct,
      status,
    };
  }).sort((a, b) => b.utilizationPct - a.utilizationPct);
}

function buildRouteRationale(selectedPlan: OptimizationPlan | null, demoData: DemoDataResponse | null): RouteRationale[] {
  if (!selectedPlan?.production_plan || !demoData) return [];

  return selectedPlan.production_plan.map((allocation) => {
    const route = demoData.routes.find((item) => item.facility_id === allocation.facility_id && item.product_id === allocation.product_id);
    const product = demoData.products.find((item) => item.id === allocation.product_id);
    const facility = demoData.facilities.find((item) => item.id === allocation.facility_id);
    const hoursUsed = allocation.units_assigned * (route?.hours_per_unit ?? 0);
    return {
      ...allocation,
      facilityName: facility?.name ?? allocation.facility_id,
      productName: product?.name ?? allocation.product_id,
      profitPerHour: hoursUsed > 0 ? allocation.profit_usd / hoursUsed : 0,
      hoursUsed,
    };
  }).sort((a, b) => b.profitPerHour - a.profitPerHour);
}

function getExecutiveVerdict(
  scenarioStatus: string,
  selectedPlan: OptimizationPlan | null,
  tradeoffSummary?: { carbon_gap_kg_if_demand_protected: number; unmet_demand_units_if_compliance_protected: number; profit_delta_usd_if_compliance_protected: number } | null
) {
  if (scenarioStatus === "infeasible" || selectedPlan?.status !== "Optimal") {
    return "This scenario is infeasible under current hard constraints; executives need to loosen capacity, carbon, or demand commitments before approving it.";
  }

  if (tradeoffSummary) {
    return `Carbon compliance is possible, but it requires a trade-off: ${tradeoffSummary.unmet_demand_units_if_compliance_protected.toLocaleString()} units unmet and ${formatMoney(tradeoffSummary.profit_delta_usd_if_compliance_protected)} profit impact versus protecting demand.`;
  }

  return `The selected plan meets ${(selectedPlan.demand_met_pct ?? 0).toFixed(1)}% of demand while staying within the active carbon guardrail, with ${formatMoney(selectedPlan.total_profit_usd ?? 0)} projected profit.`;
}

function constraintGroup(name: string) {
  if (name.includes("Carbon")) return "Carbon";
  if (name.includes("Capacity")) return "Capacity";
  if (name.includes("Demand")) return "Demand";
  return "Other";
}

function readableConstraintName(name: string) {
  return name
    .replace("Hard_Global_Carbon_Cap", "Hard carbon cap")
    .replace("Soft_Global_Carbon_Cap", "Carbon cap with overage variable")
    .replace("Global_Carbon_Cap", "Global carbon cap")
    .replace("Capacity_", "Capacity: ")
    .replace("Demand_", "Demand: ")
    .replace("Soft_Demand_", "Demand with shortfall: ")
    .replaceAll("_", " ");
}

function constraintMeaning(name: string, group: string) {
  if (group === "Carbon") return name.startsWith("Soft") ? "Demand protection is creating a measurable carbon gap." : "The carbon ceiling is limiting the profit-maximizing plan.";
  if (group === "Capacity") return "This facility is using its available labor-hour envelope.";
  if (group === "Demand") return "The model is preserving or relaxing product demand commitments.";
  return "The solver marked this constraint as economically relevant.";
}

function readableRelaxedConstraint(item: RelaxedConstraint) {
  if (item.type === "carbon_cap") return `Relaxed carbon cap by ${kgToTons(item.relaxed_by_kg).toLocaleString()} t`;
  return `Relaxed demand for ${item.product_id} by ${item.relaxed_by_units.toLocaleString()} units`;
}

function formatConstraintSlack(item: ReturnType<typeof buildWatchlist>[number]) {
  if (item.group === "Carbon") return `${kgToTons(Math.abs(item.slack)).toLocaleString()} t`;
  if (item.group === "Capacity") return `${Math.abs(item.slack).toLocaleString()} hrs`;
  return Math.abs(item.slack).toLocaleString();
}

function labelFacility(facilityId: string, demoData: DemoDataResponse | null) {
  const name = demoData?.facilities.find((facility) => facility.id === facilityId)?.name ?? facilityId;
  return name.replace(/^Factory\s+/i, "F");
}

function readableMode(mode: string) {
  return mode === "protect_compliance" ? "Protect Compliance" : "Protect Demand";
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value / 1000000).toFixed(2)}M`;
}

function formatMoneyPerHour(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "N/A";
  return `$${Math.round(value).toLocaleString()}/hr`;
}

function formatMoneyShort(value: number) {
  return `$${(value / 1000000).toFixed(1)}M`;
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function groupBadgeClass(group: string) {
  if (group === "Carbon") return "bg-emerald-500/10 text-emerald-700";
  if (group === "Capacity") return "bg-blue-500/10 text-blue-700";
  if (group === "Demand") return "bg-orange-500/10 text-orange-700";
  return "bg-muted text-muted-foreground";
}

function utilizationBadgeClass(status: FacilityUtilization["status"]) {
  if (status === "Binding") return "bg-orange-500/10 text-orange-700";
  if (status === "Tight") return "bg-blue-500/10 text-blue-700";
  return "bg-emerald-500/10 text-emerald-700";
}
