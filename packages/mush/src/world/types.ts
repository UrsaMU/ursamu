/** SDK-facing object type — flags as Set, contents hydrated. */
export interface IDBObj {
  id: string;
  name?: string;
  flags: Set<string>;
  location?: string;
  state: Record<string, unknown>;
  contents: IDBObj[];
}

/** Raw KV storage type — flags as space-delimited string. */
export interface IDBOBJ {
  id: string;
  description?: string;
  location?: string;
  flags: string;
  data?: {
    attributes?: IAttribute[];
    name?: string;
    password?: string;
    moniker?: string;
    money?: number;
    quota?: number;
    [key: string]: unknown;
  };
}

/** Object attribute shape. */
export interface IAttribute {
  name: string;
  value: string;
  /** "attribute" = JS/TS sandbox (default); "softcode" = MUX softcode evaluator. */
  type?: "attribute" | "softcode" | string;
  setter: string;
  hidden?: boolean;
}

export interface IGameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}
