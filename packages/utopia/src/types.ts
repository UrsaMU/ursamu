export interface IStory {
  id: string;
  title: string;
  severity: number;
  ongoing?: boolean;
}

export interface ICity {
  id: string;
  name: string;
  week: number;
  tension: IStory;
  stories: IStory[];
}

export interface IChar {
  id: string;
  playerId?: string;
  name: string;
  danger: number;
  resources: number;
  bravado: number;
  lifestyle: number;
  plan: string;
  ready: boolean;
  lockedDv: number | null;
  dangerAdded: boolean;
  goals: string[];
  location: string;
  status?: string;
  system?: string;
  data?: Record<string, unknown>;
}

export interface ISphereNpc {
  id: string;
  playerId: string;
  name: string;
  rep: number;
  job: string;
}

export type RulingResult = "holds" | "hitch" | "fails";

export interface IActionDef {
  id: string;
  label: string;
  skill: string;
}

export interface IRollInput {
  skillDice: number;
  danger: number;
  lockedDv: number | null;
  buyHitch: boolean;
  rng: () => number;
}

export interface IRollOut {
  total: number;
  dv: number;
  result: RulingResult;
  danger: number;
}
