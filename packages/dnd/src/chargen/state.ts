/**
 * Chargen draft state stored at state.dnd_cg.
 */
import type {
  DndAbility,
  DndSheet,
  DndSkill,
} from "../stats/dnd_sheet.ts";

export interface DndCgState {
  stage: number;
  class: string;
  species: string;
  background: string;
  abilities: Record<DndAbility, number>;
  abilityIncreases: Record<DndAbility, number>;
  chosenSkills: DndSkill[];
  chosenSpells: string[];
  chosenFeats: string[];
  startingGear?: "equipment" | "gold";
  chosenGearOptions?: number[];
  /** Staff review */
  isSubmitted?: boolean;
  submittedJob?: number;
  submittedAt?: number;
  /** Built sheet awaiting +approve */
  pendingSheet?: DndSheet;
}

export function initCgState(): DndCgState {
  return {
    stage: 1,
    class: "",
    species: "",
    background: "",
    abilities: {
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    },
    abilityIncreases: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    },
    chosenSkills: [],
    chosenSpells: [],
    chosenFeats: [],
    startingGear: "equipment",
    chosenGearOptions: [],
    isSubmitted: false,
  };
}

export function readCg(
  // deno-lint-ignore no-explicit-any
  obj: any,
): DndCgState | null {
  const raw = obj?.state?.dnd_cg ?? obj?.data?.dnd_cg;
  if (!raw || typeof raw !== "object") return null;
  return raw as DndCgState;
}

export function hasLiveSheet(
  // deno-lint-ignore no-explicit-any
  obj: any,
): boolean {
  return !!(obj?.state?.dnd ?? obj?.data?.dnd);
}

export function isApprovedFlag(
  // deno-lint-ignore no-explicit-any
  obj: any,
): boolean {
  const f = obj?.flags;
  if (f instanceof Set) return f.has("approved");
  if (Array.isArray(f)) {
    return f.map(String).some((x) =>
      x.toLowerCase() === "approved"
    );
  }
  return String(f ?? "").toLowerCase().split(/[\s,]+/)
    .includes("approved");
}
