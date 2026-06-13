// Changeling: The Lost starting Contract selection (chargen Stage 7).
//
// Enforces the CtL 2e starting package:
//   - 4 Common Contracts (Common Arcadian of any Regalia, Common Court of the
//     character's own court, or Goblin), of which at least 2 must be Common
//     Arcadian Contracts from a favored Regalia, and at most 2 may be Goblin.
//   - 2 Royal Contracts (Royal Arcadian from a favored Regalia, or a Court
//     Contract of the character's own court).
// A character's favored Regalia are her seeming's favored Regalia plus the
// second favored Regalia she chooses at creation (the "favored" custom field).

import {
  CTL_CONTRACTS,
  findContract,
  favoredRegaliaForSeeming,
  type CtlContract,
} from "../dictionary/index.ts";
import type { CofdSheet } from "../stats/index.ts";
import type { CofdCgState } from "./state.ts";

const COMMON_COUNT = 4;
const ROYAL_COUNT = 2;
const FAVORED_COMMON_MIN = 2;
const GOBLIN_MAX = 2;

/** The two favored Regalia for a sheet: seeming's favored + the chosen second. */
export function favoredRegalia(sheet: CofdSheet): string[] {
  const out: string[] = [];
  const seemingFav = favoredRegaliaForSeeming(sheet.customFields?.seeming ?? "");
  if (seemingFav) out.push(seemingFav);
  const second = (sheet.customFields?.favored ?? "").trim();
  if (second && !out.some((r) => r.toLowerCase() === second.toLowerCase())) {
    // Normalize to the seeming-fav casing if it matches, else title-ish as given.
    out.push(second);
  }
  return out;
}

function isFavoredRegalia(sheet: CofdSheet, regalia: string | null): boolean {
  if (!regalia) return false;
  return favoredRegalia(sheet).some((r) => r.toLowerCase() === regalia.toLowerCase());
}

function ownCourt(sheet: CofdSheet): string {
  return (sheet.customFields?.court ?? "").trim();
}

/** Which starting pool a contract counts toward: "common" or "royal". */
function poolOf(c: CtlContract): "common" | "royal" {
  if (c.type === "goblin") return "common";
  return c.tier === "royal" ? "royal" : "common";
}

function chosen(sheet: CofdSheet): CtlContract[] {
  const out: CtlContract[] = [];
  for (const n of sheet.contracts ?? []) {
    const c = findContract(n);
    if (c) out.push(c);
  }
  return out;
}

interface Counts {
  common: number;
  royal: number;
  goblin: number;
  favoredCommon: number; // Common Arcadian from a favored Regalia
}

function counts(sheet: CofdSheet): Counts {
  const c: Counts = { common: 0, royal: 0, goblin: 0, favoredCommon: 0 };
  for (const ct of chosen(sheet)) {
    if (poolOf(ct) === "common") c.common++; else c.royal++;
    if (ct.type === "goblin") c.goblin++;
    if (ct.type === "arcadian" && ct.tier === "common" && isFavoredRegalia(sheet, ct.regalia)) {
      c.favoredCommon++;
    }
  }
  return c;
}

export interface ContractPackage {
  favored: string[];
  court: string;
  commonCount: number;
  royalCount: number;
  favoredCommonMin: number;
  goblinMax: number;
}

export function contractPackage(sheet: CofdSheet): ContractPackage {
  return {
    favored: favoredRegalia(sheet),
    court: ownCourt(sheet),
    commonCount: COMMON_COUNT,
    royalCount: ROYAL_COUNT,
    favoredCommonMin: FAVORED_COMMON_MIN,
    goblinMax: GOBLIN_MAX,
  };
}

function clone(cgState: CofdCgState): CofdCgState {
  return { ...cgState, sheet: JSON.parse(JSON.stringify(cgState.sheet)) as CofdSheet };
}

function assertChangeling(sheet: CofdSheet): void {
  if ((sheet.template || "").toLowerCase().trim() !== "changeling") {
    throw new Error("Only Changeling: the Lost characters choose Contracts.");
  }
}

/** Add a starting Contract by name, enforcing the full CtL gating. */
export function addContract(cgState: CofdCgState, name: string): CofdCgState {
  const next = clone(cgState);
  const sheet = next.sheet;
  assertChangeling(sheet);

  const c = findContract(name);
  if (!c) throw new Error(`No Contract named '${name}'. Browse with %ch+cg/list contracts%cn.`);

  const list = (sheet.contracts ??= []);
  if (list.some((n) => n.toLowerCase() === c.name.toLowerCase())) {
    throw new Error(`You have already chosen '${c.name}'.`);
  }

  const fav = favoredRegalia(sheet);
  if (fav.length === 0) {
    throw new Error("Set your seeming and second favored Regalia (Stage 3) before choosing Contracts.");
  }
  const court = ownCourt(sheet);
  const cur = counts(sheet);
  const pool = poolOf(c);

  // Eligibility by kind.
  if (c.type === "goblin") {
    if (cur.goblin >= GOBLIN_MAX) throw new Error(`You may take at most ${GOBLIN_MAX} Goblin Contracts at creation.`);
  } else if (c.type === "court") {
    if (court.toLowerCase() !== (c.court ?? "").toLowerCase()) {
      throw new Error(`${c.name} is a ${c.court} Court Contract; you belong to the ${court || "(unset)"} Court.`);
    }
  } else if (c.type === "arcadian" && c.tier === "royal") {
    if (!isFavoredRegalia(sheet, c.regalia)) {
      throw new Error(`Royal Arcadian Contracts must come from a favored Regalia (${fav.join(", ")}). ${c.name} is ${c.regalia}.`);
    }
  }

  // Pool capacity.
  if (pool === "common" && cur.common >= COMMON_COUNT) {
    throw new Error(`You have already chosen all ${COMMON_COUNT} Common Contracts.`);
  }
  if (pool === "royal" && cur.royal >= ROYAL_COUNT) {
    throw new Error(`You have already chosen all ${ROYAL_COUNT} Royal Contracts.`);
  }

  list.push(c.name);
  return next;
}

/** Remove a previously chosen Contract by name. */
export function removeContract(cgState: CofdCgState, name: string): CofdCgState {
  const next = clone(cgState);
  const list = next.sheet.contracts ?? [];
  const idx = list.findIndex((n) => n.toLowerCase() === name.trim().toLowerCase());
  if (idx < 0) throw new Error(`You have not chosen a Contract named '${name}'.`);
  list.splice(idx, 1);
  next.sheet.contracts = list;
  return next;
}

/** Validate that the Stage-7 starting package is exactly satisfied. */
export function validateContractStage(sheet: CofdSheet): { valid: boolean; error?: string } {
  if (favoredRegalia(sheet).length === 0) {
    return { valid: false, error: "Seeming and second favored Regalia must be set before Contracts." };
  }
  const c = counts(sheet);
  if (c.common !== COMMON_COUNT) {
    return { valid: false, error: `Choose exactly ${COMMON_COUNT} Common Contracts. You have ${c.common}.` };
  }
  if (c.royal !== ROYAL_COUNT) {
    return { valid: false, error: `Choose exactly ${ROYAL_COUNT} Royal Contracts. You have ${c.royal}.` };
  }
  if (c.favoredCommon < FAVORED_COMMON_MIN) {
    return { valid: false, error: `At least ${FAVORED_COMMON_MIN} of your Common Contracts must be Arcadian Contracts from a favored Regalia. You have ${c.favoredCommon}.` };
  }
  if (c.goblin > GOBLIN_MAX) {
    return { valid: false, error: `No more than ${GOBLIN_MAX} Goblin Contracts at creation. You have ${c.goblin}.` };
  }
  return { valid: true };
}

/** Summary numbers used by the Stage-7 instructions renderer. */
export function contractStageProgress(sheet: CofdSheet): {
  pkg: ContractPackage;
  common: number;
  royal: number;
  goblin: number;
  favoredCommon: number;
} {
  return { pkg: contractPackage(sheet), ...counts(sheet) };
}

/** Count of Arcadian/Court/Goblin contracts (for diagnostics/tests). */
export function contractCatalogSize(): number {
  return CTL_CONTRACTS.length;
}
