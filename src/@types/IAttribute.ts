export interface IAttribute {
  name: string;
  value: string;
  /** "attribute" = JS/TS sandbox (default); "softcode" = MUX softcode evaluator. */
  type?: "attribute" | "softcode" | string;
  setter: string;
  hidden?: boolean;
}
