import { useState } from "react";
import { useScenarioStore } from "../../store/scenarioStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Plus, Trash2, Edit2, Check, X, PanelLeftClose, PanelLeft, LayoutDashboard, Leaf } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const { scenarios, activeScenarioId, addScenario, renameScenario, deleteScenario, setActiveScenario } = useScenarioStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const saveEdit = (id: string) => {
    if (editName.trim()) renameScenario(id, editName);
    setEditingId(null);
  };

  return (
    <div className={cn("flex flex-col border-r bg-muted/30 transition-all duration-300", isCollapsed ? "w-16 items-center" : "w-64")}>
      <div className="flex h-14 items-center justify-between border-b px-4">
        {!isCollapsed && <span className="font-semibold flex items-center gap-2"><Leaf color="#5cdb2e" className="w-5 h-5 text-primary"/> OptiZero</span>}
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(!isCollapsed)}>
          {isCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex-1 overflow-auto py-4">
        {!isCollapsed && <div className="px-4 mb-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scenarios</div>}
        
        <div className="space-y-1 px-2">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                activeScenarioId === s.id ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                isCollapsed && "justify-center px-0"
              )}
              onClick={() => setActiveScenario(s.id)}
            >
              {isCollapsed ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                  {s.name.charAt(0)}
                </div>
              ) : editingId === s.id ? (
                <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                  <Input 
                    value={editName} 
                    onChange={(e) => setEditName(e.target.value)} 
                    className="h-7 text-xs px-2 py-1"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(s.id)}
                  />
                  <Check className="h-4 w-4 cursor-pointer text-green-500 hover:text-green-600" onClick={() => saveEdit(s.id)} />
                  <X className="h-4 w-4 cursor-pointer text-red-500 hover:text-red-600" onClick={() => setEditingId(null)} />
                </div>
              ) : (
                <>
                  <span className="truncate">{s.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); startEditing(s.id, s.name); }} />
                    {scenarios.length > 1 && (
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteScenario(s.id); }} />
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t p-4 flex justify-center">
        {isCollapsed ? (
          <Button variant="default" size="icon" onClick={() => addScenario("New Scenario")} title="New Scenario">
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="w-full gap-2" onClick={() => addScenario("New Scenario")}>
            <Plus className="h-4 w-4" /> New Scenario
          </Button>
        )}
      </div>
    </div>
  );
}