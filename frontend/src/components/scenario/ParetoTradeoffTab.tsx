import { useEffect, useMemo, type ComponentType, type MouseEvent } from "react";
import { useScenarioStore, type ParetoPoint } from "../../store/scenarioStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CircleDollarSign, Leaf, MousePointerClick, TrendingDown } from "lucide-react";
import { cn } from "../../lib/utils";

const DEMAND_COLOR = "#2563eb";
const COMPLIANCE_COLOR = "#059669";
const CURRENT_COLOR = "#f59e0b";

type ChartPoint = ParetoPoint & {
  demandProfitValue: number | null;
  complianceProfitValue: number | null;
};

type ParetoTooltipProps = {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    payload: ChartPoint;
  }>;
};

export function ParetoTradeoffTab() {
  const { scenarios, activeScenarioId, updateScenarioInputs, runSimulation, generateParetoFrontier } = useScenarioStore();
  const activeScenario = scenarios.find((s) => s.id === activeScenarioId);

  useEffect(() => {
    if (!activeScenario) return;
    generateParetoFrontier(activeScenario.id);
  }, [
    activeScenario?.id,
    activeScenario?.carbonCap,
    activeScenario?.factoryOutage,
    activeScenario?.demandSurge,
    activeScenario?.maxOvertimePct,
    generateParetoFrontier,
  ]);

  const formatMoney = (value: number) => `$${(value / 1000000).toFixed(1)}M`;
  const formatCarbon = (value: number) => `${(value / 1000).toFixed(0)}k t`;

  const chartData = useMemo<ChartPoint[]>(
    () =>
      activeScenario?.paretoFrontier.map((point) => ({
        ...point,
        demandProfitValue: point.decisionStatus === "infeasible" ? null : point.demandProfit,
        complianceProfitValue:
          point.decisionStatus === "infeasible" || point.complianceProfit === undefined
            ? null
            : point.complianceProfit,
      })) ?? [],
    [activeScenario?.paretoFrontier]
  );

  const feasiblePoints = useMemo(
    () => chartData.filter((point) => point.decisionStatus !== "infeasible"),
    [chartData]
  );

  const infeasiblePoints = useMemo(
    () => chartData.filter((point) => point.decisionStatus === "infeasible"),
    [chartData]
  );

  const currentCurvePoint = useMemo(() => {
    if (!activeScenario) return undefined;
    return chartData.find((point) => point.carbonCap === activeScenario.carbonCap);
  }, [activeScenario, chartData]);

  const currentMarkerProfit =
    activeScenario?.selectedPlanMode === "protect_compliance"
      ? currentCurvePoint?.complianceProfit
      : currentCurvePoint?.demandProfit;

  const currentMarkerLabel =
    activeScenario?.selectedPlanMode === "protect_compliance"
      ? "Current: Compliance Plan"
      : "Current: Demand Plan";

  const complianceCost = useMemo(() => {
    if (!currentCurvePoint?.complianceProfit) return null;
    const gap = currentCurvePoint.demandProfit - currentCurvePoint.complianceProfit;
    return gap > 0 ? gap : null;
  }, [currentCurvePoint]);

  const steepestComplianceDrop = useMemo(() => {
    const compliancePoints = feasiblePoints.filter((point) => point.complianceProfit !== undefined);
    if (compliancePoints.length < 2) return null;

    return compliancePoints.slice(1).reduce<{
      fromCap: number;
      toCap: number;
      profitDrop: number;
    } | null>((steepest, point, index) => {
      const previous = compliancePoints[index];
      const profitDrop = previous.complianceProfit! - point.complianceProfit!;

      if (!steepest || profitDrop > steepest.profitDrop) {
        return {
          fromCap: previous.carbonCap,
          toCap: point.carbonCap,
          profitDrop,
        };
      }

      return steepest;
    }, null);
  }, [feasiblePoints]);

  if (!activeScenario) return null;

  const CustomTooltip = ({ active, payload }: ParetoTooltipProps) => {
    if (!active || !payload?.length) return null;

    const point = payload[0].payload;

    return (
      <div className="rounded-md border bg-card p-3 text-card-foreground shadow-lg">
        <p className="mb-2 font-semibold">Carbon Cap: {point.carbonCap.toLocaleString()} t</p>
        {point.decisionStatus === "infeasible" ? (
          <>
            <p className="font-medium text-destructive">Infeasible with current guardrails</p>
            <p className="mt-2 text-xs text-muted-foreground">Loosen the cap or add capacity to recover a plan.</p>
          </>
        ) : (
          <div className="space-y-2 text-xs">
            <TooltipSection
              color={DEMAND_COLOR}
              title="Protect Demand"
              profit={point.demandProfit}
              totalCO2={point.demandTotalCO2}
              demandMet={point.demandMet}
              carbonOverage={point.demandCarbonOverage}
              unmetDemandUnits={point.demandUnmetDemandUnits}
            />
            {point.complianceProfit !== undefined && (
              <TooltipSection
                color={COMPLIANCE_COLOR}
                title="Protect Compliance"
                profit={point.complianceProfit}
                totalCO2={point.complianceTotalCO2 ?? 0}
                demandMet={point.complianceDemandMet ?? 0}
                carbonOverage={point.complianceCarbonOverage ?? 0}
                unmetDemandUnits={point.complianceUnmetDemandUnits ?? 0}
              />
            )}
            <p className="pt-1 text-muted-foreground">Click a point to load this cap into Scenario Studio.</p>
          </div>
        )}
      </div>
    );
  };

  const handlePointClick = (data?: { carbonCap?: number }) => {
    if (data?.carbonCap) {
      updateScenarioInputs(activeScenario.id, { carbonCap: data.carbonCap });
      runSimulation(activeScenario.id);
    }
  };

  const hasFrontier = chartData.length > 0;

  return (
    <div className="grid h-full grid-cols-1 gap-6 xl:grid-cols-4">
      <div className="xl:col-span-1 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pareto Trade-off Curve</h2>
          <p className="text-muted-foreground mt-2">
            Compare the profit from protecting demand with the profit from strict carbon compliance at each cap.
          </p>
        </div>

        {activeScenario.decisionStatus === "infeasible" && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Active Scenario Infeasible
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {activeScenario.errorMessage ?? "The selected constraints cannot currently meet required demand."}
            </CardContent>
          </Card>
        )}

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-sm uppercase tracking-wider">Executive Insight</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3">
              <InsightMetric
                icon={Leaf}
                label="Current cap"
                value={`${activeScenario.carbonCap.toLocaleString()} t`}
              />
              <InsightMetric
                icon={CircleDollarSign}
                label="Current marker"
                value={currentMarkerProfit !== undefined ? `${currentMarkerLabel}: ${formatMoney(currentMarkerProfit)}` : "Infeasible"}
                isWarning={activeScenario.decisionStatus === "infeasible"}
              />
              <InsightMetric
                icon={TrendingDown}
                label="Compliance cost at current cap"
                value={complianceCost ? formatMoney(complianceCost) : "No gap at this cap"}
              />
              <InsightMetric
                icon={TrendingDown}
                label="Steepest compliance drop"
                value={
                  steepestComplianceDrop && steepestComplianceDrop.profitDrop > 0
                    ? `${formatMoney(steepestComplianceDrop.profitDrop)} between ${formatCarbon(steepestComplianceDrop.fromCap)} and ${formatCarbon(steepestComplianceDrop.toCap)}`
                    : "No major cliff in this range"
                }
              />
            </div>

            <div className="space-y-2 rounded-md border bg-background/60 p-3 text-xs text-muted-foreground">
              <LegendRow color={DEMAND_COLOR} dashed label="Protect Demand: fulfills orders, may exceed carbon cap." />
              <LegendRow color={COMPLIANCE_COLOR} label="Protect Compliance: respects carbon cap, may leave demand unmet." />
              <LegendRow color={CURRENT_COLOR} label="Current marker follows the selected plan mode." />
            </div>

            <div className="flex items-start gap-2 rounded-md border bg-background/60 p-3 text-xs text-muted-foreground">
              <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
              Click either curve to push that carbon cap back into Scenario Studio.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="xl:col-span-3">
        <Card className="flex h-full min-h-[500px] flex-col">
          <CardHeader>
            <CardTitle>Profit vs Carbon Cap</CardTitle>
            <CardDescription>
              The gap between the two curves is the estimated cost of strict compliance at each carbon cap.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[440px] w-full flex-1">
            {!hasFrontier ? (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm font-medium text-muted-foreground">
                Generating frontier from active scenario inputs...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" className="select-none outline-none">
                <LineChart
                  data={chartData}
                  margin={{ top: 36, right: 36, left: 20, bottom: 20 }}
                  accessibilityLayer={false}
                  className="outline-none"
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="carbonCap"
                    tickFormatter={formatCarbon}
                    type="number"
                    domain={[50000, 1000000]}
                    label={{ value: "Carbon Cap (tons CO2e)", position: "bottom", offset: 0 }}
                    stroke="#64748b"
                  />
                  <YAxis
                    tickFormatter={formatMoney}
                    width={80}
                    label={{ value: "Optimal Profit ($)", angle: -90, position: "left" }}
                    stroke="#64748b"
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: CURRENT_COLOR, strokeOpacity: 0.25 }} />

                  <Line
                    type="linear"
                    name="Protect Demand"
                    dataKey="demandProfitValue"
                    stroke={DEMAND_COLOR}
                    strokeWidth={3}
                    strokeDasharray="7 5"
                    dot={(props) => (
                      <FrontierDot {...props} color={DEMAND_COLOR} onSelect={handlePointClick} />
                    )}
                    activeDot={(props) => (
                      <FrontierDot {...props} color={DEMAND_COLOR} isActive onSelect={handlePointClick} />
                    )}
                    className="outline-none"
                    connectNulls={false}
                  />

                  <Line
                    type="linear"
                    name="Protect Compliance"
                    dataKey="complianceProfitValue"
                    stroke={COMPLIANCE_COLOR}
                    strokeWidth={3}
                    dot={(props) => (
                      <FrontierDot {...props} color={COMPLIANCE_COLOR} onSelect={handlePointClick} />
                    )}
                    activeDot={(props) => (
                      <FrontierDot {...props} color={COMPLIANCE_COLOR} isActive onSelect={handlePointClick} />
                    )}
                    className="outline-none"
                    connectNulls={false}
                  />

                  <Scatter
                    data={infeasiblePoints.map((point) => ({ ...point, demandProfitValue: 0 }))}
                    dataKey="demandProfitValue"
                    fill="hsl(var(--destructive))"
                    shape="circle"
                  />

                  {currentMarkerProfit !== undefined && (
                    <ReferenceDot
                      x={activeScenario.carbonCap}
                      y={currentMarkerProfit}
                      r={7}
                      fill={CURRENT_COLOR}
                      stroke="hsl(var(--background))"
                      strokeWidth={3}
                      label={{
                        value: currentMarkerLabel,
                        position: "top",
                        fill: "#334155",
                        fontSize: 12,
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type TooltipSectionProps = {
  color: string;
  title: string;
  profit: number;
  totalCO2: number;
  demandMet: number;
  carbonOverage: number;
  unmetDemandUnits: number;
};

function TooltipSection({ color, title, profit, totalCO2, demandMet, carbonOverage, unmetDemandUnits }: TooltipSectionProps) {
  return (
    <div className="border-t pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2 font-semibold" style={{ color }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {title}: ${(profit / 1000000).toFixed(2)}M
      </div>
      <div className="mt-1 text-muted-foreground">CO2 Used: {totalCO2.toLocaleString()} t</div>
      <div className="text-muted-foreground">Demand Met: {demandMet.toFixed(1)}%</div>
      {carbonOverage > 0 && <div className="text-orange-600">Carbon Gap: {carbonOverage.toLocaleString()} t</div>}
      {unmetDemandUnits > 0 && <div className="text-orange-600">Unmet Demand: {unmetDemandUnits.toLocaleString()} units</div>}
    </div>
  );
}

type FrontierDotProps = {
  cx?: number;
  cy?: number;
  payload?: {
    carbonCap?: number;
  };
  color: string;
  isActive?: boolean;
  onSelect: (data?: { carbonCap?: number }) => void;
};

function FrontierDot({ cx, cy, payload, color, isActive, onSelect }: FrontierDotProps) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;

  const handleClick = (event: MouseEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(payload);
  };

  return (
    <circle
      cx={cx}
      cy={cy}
      r={isActive ? 5 : 4}
      className="cursor-pointer outline-none transition-opacity hover:opacity-80"
      fill={color}
      stroke="hsl(var(--background))"
      strokeWidth={2}
      onClick={handleClick}
      onMouseDown={(event) => event.preventDefault()}
      tabIndex={-1}
    />
  );
}

function LegendRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("h-0.5 w-6 shrink-0", dashed && "border-t-2 border-dashed bg-transparent")}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}

type InsightMetricProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isWarning?: boolean;
};

function InsightMetric({ icon: Icon, label, value, isWarning }: InsightMetricProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-background/60 p-3">
      <div className={cn("rounded-md bg-primary/10 p-2 text-primary", isWarning && "bg-destructive/10 text-destructive")}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("truncate font-semibold", isWarning && "text-destructive")}>{value}</div>
      </div>
    </div>
  );
}
