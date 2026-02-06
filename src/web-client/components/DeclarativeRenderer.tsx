import { JSX } from "preact";
import { UIComponent } from "../types/UITree.ts";
import { Button } from "./Button.tsx";

interface Props {
  component: UIComponent;
  onAction?: (action: string) => void;
}

export function DeclarativeRenderer({ component, onAction }: Props): JSX.Element {
  switch (component.type) {
    case "panel":
      return (
        <div 
          className={`flex ${component.direction === "row" ? "flex-row" : "flex-col"} gap-2 ${component.className || ""}`}
        >
          {component.children.map((child, i) => (
            <DeclarativeRenderer key={i} component={child} onAction={onAction} />
          ))}
        </div>
      );

    case "button":
      return (
        <Button 
          onClick={() => onAction?.(component.action)}
          className={component.className}
        >
          {component.label}
        </Button>
      );

    case "gauge": {
      const percentage = (component.value / component.max) * 100;
      return (
        <div className={`w-full bg-slate-800 rounded-full h-4 relative overflow-hidden ${component.className || ""}`}>
          <div 
            className={`h-full transition-all duration-500 rounded-full ${component.color || "bg-primary"}`}
            style={{ width: `${percentage}%` }}
          />
          {component.label && (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-tighter shadow-sm">
              {component.label} ({component.value}/{component.max})
            </span>
          )}
        </div>
      );
    }

    case "text":
      return <span className={component.className}>{component.content}</span>;

    default:
      return <span />;
  }
}
