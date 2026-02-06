export type UIComponent = 
  | UIPanel 
  | UIButton 
  | UIGauge 
  | UIText;

export interface UIPanel {
  type: "panel";
  direction?: "row" | "column";
  children: UIComponent[];
  className?: string;
}

export interface UIButton {
  type: "button";
  label: string;
  action: string;
  optimistic?: boolean;
  className?: string;
}

export interface UIGauge {
  type: "gauge";
  value: number;
  max: number;
  label?: string;
  color?: string;
  className?: string;
}

export interface UIText {
  type: "text";
  content: string;
  className?: string;
}

export interface UITree {
  root: UIComponent;
}
