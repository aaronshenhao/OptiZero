import { useEffect } from "react";
import { useScenarioStore } from "../../store/scenarioStore";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Clock, TrendingUp, Factory, Zap } from "lucide-react";

export function ScenarioSettings() {
  const { scenarios, activeScenarioId, updateScenarioInputs, runSimulation } = useScenarioStore();
  const activeScenario = scenarios.find(s => s.id === activeScenarioId);

  useEffect(() => {
    if (!activeScenario) return;
    const timer = setTimeout(() => {
      runSimulation(activeScenario.id);
    }, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [
    activeScenario?.carbonCap, 
    activeScenario?.factoryOutage, 
    activeScenario?.demandSurge, 
    activeScenario?.maxOvertimePct,
    activeScenario?.id, 
    runSimulation
  ]);

  if (!activeScenario) return null;

  return (
    <Card className="h-full min-h-0 overflow-y-auto">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500"/> Controllers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-7 pb-5">
        
        {/* Carbon Policy Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <h4 className="font-semibold text-sm uppercase text-muted-foreground tracking-wider">Carbon Policy</h4>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Carbon Cap (tons CO₂e)</Label>
              <span className="text-sm font-medium text-primary">
                {activeScenario.carbonCap.toLocaleString()}
              </span>
            </div>
            <Slider 
              min={50000} 
              max={1000000} 
              step={10000} 
              value={[activeScenario.carbonCap]} 
              onValueChange={([val]) => updateScenarioInputs(activeScenario.id, { carbonCap: val })} 
            />
            <p className="text-xs text-muted-foreground">Sets the maximum allowable global emissions.</p>
          </div>
        </div>

        {/* Operational Shocks Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2 mt-4">
            <h4 className="font-semibold text-sm uppercase text-muted-foreground tracking-wider">Operational Shocks</h4>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="flex items-center gap-1"><Factory className="h-3 w-3"/> Facility Outage</Label>
              <span className="text-sm font-medium text-destructive">
                -{Math.round(activeScenario.factoryOutage * 100)}%
              </span>
            </div>
            <Slider 
              min={0} 
              max={1} 
              step={0.05} 
              value={[activeScenario.factoryOutage]} 
              onValueChange={([val]) => updateScenarioInputs(activeScenario.id, { factoryOutage: val })} 
            />
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex justify-between">
              <Label className="flex items-center gap-1"><TrendingUp className="h-3 w-3"/> Demand Surge</Label>
              <span className="text-sm font-medium text-blue-500">
                +{Math.round(activeScenario.demandSurge * 100)}%
              </span>
            </div>
            <Slider 
              min={0} 
              max={0.5} 
              step={0.05} 
              value={[activeScenario.demandSurge]} 
              onValueChange={([val]) => updateScenarioInputs(activeScenario.id, { demandSurge: val })} 
            />
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex justify-between">
              <Label className="flex items-center gap-1"><Clock className="h-3 w-3"/> Max Overtime</Label>
              <span className="text-sm font-medium text-primary">
                +{Math.round(activeScenario.maxOvertimePct)}%
              </span>
            </div>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[activeScenario.maxOvertimePct]}
              onValueChange={([val]) => updateScenarioInputs(activeScenario.id, { maxOvertimePct: val })}
            />
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
