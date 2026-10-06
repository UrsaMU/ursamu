/** Cinematic Unisystem character schema (state.cinematic). */
import type { IMaskState, IQEntry } from "./data-types.ts";

export type {
  IArmor,
  ICharType,
  IDmg,
  IManeuver,
  IMaskState,
  IPower,
  IPrereq,
  IQuality,
  IQEntry,
  ISkillDef,
  ITemplate,
  IWeapon,
} from "./data-types.ts";

export const ATTRS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "perception",
  "willpower",
] as const;

export type AttrKey = (typeof ATTRS)[number];

export const ATTR_LABELS: Record<AttrKey, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  perception: "Perception",
  willpower: "Willpower",
};

export type CharTypeSlug = "whitehat" | "hero" | "experienced" | "";

export type ChargenStatus =
  | "none"
  | "draft"
  | "submitted"
  | "revision"
  | "approved";

export interface ICinChar {
  name: string;
  concept: string;
  type: CharTypeSlug;
  template: string;
  attrs: Record<AttrKey, number>;
  attrBonus: Partial<Record<AttrKey, number>>;
  skills: Record<string, number>;
  qualities: IQEntry[];
  drawbacks: IQEntry[];
  weaknesses: string;
  dramaPoints: number;
  dramaSpent: number;
  damage: number;
  conditions: string;
  currentForm: string;
  activeEffects: string;
  xpEarned: number;
  xpSpent: number;
  status: ChargenStatus;
  reviewedBy: string;
  reviewNote: string;
  step: number;
  background: string;
  mask: IMaskState;
  weapon: string;
  armor: string;
}

export const EMPTY_ATTRS: Record<AttrKey, number> = {
  strength: 0,
  dexterity: 0,
  constitution: 0,
  intelligence: 0,
  perception: 0,
  willpower: 0,
};

export function blankChar(): ICinChar {
  return {
    name: "",
    concept: "",
    type: "",
    template: "",
    attrs: { ...EMPTY_ATTRS },
    attrBonus: {},
    skills: {},
    qualities: [],
    drawbacks: [],
    weaknesses: "",
    dramaPoints: 0,
    dramaSpent: 0,
    damage: 0,
    conditions: "",
    currentForm: "",
    activeEffects: "",
    xpEarned: 0,
    xpSpent: 0,
    status: "none",
    reviewedBy: "",
    reviewNote: "",
    step: 1,
    background: "",
    mask: { active: false, aspects: [], impression: "" },
    weapon: "",
    armor: "",
  };
}

/** Accept legacy string entries (slug only, level 1). */
function toEntries(raw: unknown): IQEntry[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((e) =>
    typeof e === "string"
      ? { slug: e, level: 1, note: "" }
      : {
        slug: String(e?.slug ?? ""),
        level: Number(e?.level ?? 1) || 1,
        note: String(e?.note ?? ""),
      }
  );
}

/** Read state.cinematic off an IDBObj, defaulting to a blank char. */
export function readChar(
  state: Record<string, unknown> | undefined,
): ICinChar {
  const raw = state?.cinematic as Partial<ICinChar> | undefined;
  if (!raw) return blankChar();
  const blank = blankChar();
  return {
    ...blank,
    ...raw,
    attrs: { ...blank.attrs, ...(raw.attrs ?? {}) },
    attrBonus: { ...(raw.attrBonus ?? {}) },
    skills: { ...(raw.skills ?? {}) },
    qualities: toEntries(raw.qualities),
    drawbacks: toEntries(raw.drawbacks),
    mask: { ...blank.mask, ...(raw.mask ?? {}) },
  };
}
