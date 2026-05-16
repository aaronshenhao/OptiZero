import { useEffect, useMemo, type ComponentType, type MouseEvent } from "react";
import { useScenarioStore } from "../../store/scenarioStore";
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

type TooltipPayload = {
  payload: {
    carbonCap: number;
    profit: number;
    totalCO2: number;
    status: "Optimal" | "Infeasible";
  };
  value: number;
};

type ParetoTooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
};

export function ParetoTradeoffTab() {
  const { scenarios, activeScenarioId, updateScenarioInputs, runSimulation, generateParetoFrontier } = useScenarioStore();
  const activeScenario = scenarios.find((s) => s.id === activeScenarioId);

  useEffect(() => {
    if (!activeScenario) return;
    generateParetoFrontier(activeScenario.id);
  }, [
    activeScenario?.id,
    activeScenario?.factoryOutage,
    activeScenario?.demandSurge,
    activeScenario?.allowUnmetDemand,
    generateParetoFrontier,
  ]);

  const formatMoney = (value: number) => `$${(value / 1000000).toFixed(1)}M`;
  const formatCarbon = (value: number) => `${(value / 1000).toFixed(0)}k t`;

  const optimalPoints = useMemo(
    () => activeScenario?.paretoFrontier.filter((point) => point.status === "Optimal") ?? [],
    [activeScenario?.paretoFrontier]
  );

  const infeasiblePoints = useMemo(
    () => activeScenario?.paretoFrontier.filter((point) => point.status === "Infeasible") ?? [],
    [activeScenario?.paretoFrontier]
  );

  const steepestDrop = useMemo(() => {
    if (optimalPoints.length < 2) return null;

    return optimalPoints.slice(1).reduce<{
      fromCap: number;
      toCap: number;
      profitDrop: number;
    } | null>((steepest, point, index) => {
      const previous = optimalPoints[index];
      const profitDrop = previous.profit - point.profit;

      if (!steepest || profitDrop > steepest.profitDrop) {
        return {
          fromCap: previous.carbonCap,
          toCap: point.carbonCap,
          profitDrop,
        };
      }

      return steepest;
    }, null);
  }, [optimalPoints]);

  if (!activeScenario) return null;

  const CustomTooltip = ({ active, payload }: ParetoTooltipProps) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;

      return (
        <div className="rounded-md border bg-card p-3 text-card-foreground shadow-lg">
          <p className="mb-1 font-semibold">Carbon Cap: {point.carbonCap.toLocaleString()} t</p>
          {point.status === "Optimal" ? (
            <>
              <p className="font-medium text-primary">Best Profit: ${point.profit.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">CO2 Used: {point.totalCO2.toLocaleString()} t</p>
              <p className="mt-2 text-xs text-muted-foreground">Click to load this cap into the active scenario.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-destructive">Infeasible with current guardrails</p>
              <p className="mt-2 text-xs text-muted-foreground">Loosen the cap or allow unmet demand to recover a plan.</p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  const handlePointClick = (data?: { carbonCap?: number }) => {
    if (data?.carbonCap) {
      updateScenarioInputs(activeScenario.id, { carbonCap: data.carbonCap });
      runSimulation(activeScenario.id);
    }
  };

  const hasFrontier = activeScenario.paretoFrontier.length > 0;
  const currentMarkerProfit = activeScenario.status === "Optimal" ? activeScenario.profit : undefined;

  return (
    <div className="grid h-full grid-cols-1 gap-6 xl:grid-cols-4">
      <div className="xl:col-span-1 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pareto Trade-off Curve</h2>
          <p className="text-muted-foreground mt-2">
            The efficient frontier shows the maximum achievable profit for any given carbon cap.
            Points on this curve represent the optimal configurations found by the LP solver.
          </p>
        </div>

        {activeScenario.status === "Infeasible" && (
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
                label="Current profit"
                value={activeScenario.status === "Optimal" ? formatMoney(activeScenario.profit) : "Infeasible"}
                isWarning={activeScenario.status === "Infeasible"}
              />
              <InsightMetric
                icon={TrendingDown}
                label="Steepest visible drop"
                value={
                  steepestDrop && steepestDrop.profitDrop > 0
                    ? `${formatMoney(steepestDrop.profitDrop)} between ${formatCarbon(steepestDrop.fromCap)} and ${formatCarbon(steepestDrop.toCap)}`
                    : "No major cliff in this range"
                }
              />
            </div>
            <div className="flex items-start gap-2 rounded-md border bg-background/60 p-3 text-xs text-muted-foreground">
              <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
              Click a frontier point to push that carbon cap back into Scenario Studio.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="xl:col-span-3">
        <Card className="flex h-full min-h-[500px] flex-col">
          <CardHeader>
            <CardTitle>Profit vs Carbon Emissions</CardTitle>
            <CardDescription>
              Optimal points form the frontier. Failed points remain visible so executives can see where constraints break.
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
                  data={optimalPoints}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
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
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.25 }} />

                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={(props) => (
                      <FrontierDot
                        {...props}
                        isSelected={props.payload?.carbonCap === activeScenario.carbonCap}
                        onSelect={handlePointClick}
                      />
                    )}
                    activeDot={(props) => (
                      <FrontierDot
                        {...props}
                        isActive
                        isSelected={props.payload?.carbonCap === activeScenario.carbonCap}
                        onSelect={handlePointClick}
                      />
                    )}
                    className="outline-none"
                    connectNulls={false}
                  />

                  <Scatter
                    data={infeasiblePoints.map((point) => ({ ...point, profit: 0 }))}
                    dataKey="profit"
                    fill="hsl(var(--destructive))"
                    shape="circle"
                  />

                  {currentMarkerProfit !== undefined && (
                    <ReferenceDot
                      x={activeScenario.carbonCap}
                      y={currentMarkerProfit}
                      r={6}
                      fill="hsl(var(--destructive))"
                      stroke="hsl(var(--background))"
                      strokeWidth={3}
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

type FrontierDotProps = {
  cx?: number;
  cy?: number;
  payload?: {
    carbonCap?: number;
  };
  isActive?: boolean;
  isSelected?: boolean;
  onSelect: (data?: { carbonCap?: number }) => void;
};

function FrontierDot({ cx, cy, payload, isActive, isSelected, onSelect }: FrontierDotProps) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;

  const radius = isSelected ? 6 : isActive ? 5 : 4;

  const handleClick = (event: MouseEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(payload);
  };

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      className="cursor-pointer outline-none transition-opacity hover:opacity-80"
      fill={isSelected ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
      stroke="hsl(var(--background))"
      strokeWidth={isSelected ? 3 : 2}
      onClick={handleClick}
      onMouseDown={(event) => event.preventDefault()}
      tabIndex={-1}
    />
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
