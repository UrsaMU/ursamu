// Typed re-exports of the Changeling: The Lost 2e seemings, kiths, and courts.

const url = new URL("../../resources/changeling.json", import.meta.url);
const data = JSON.parse(Deno.readTextFileSync(url));

const contractsUrl = new URL("../../resources/changeling-contracts.json", import.meta.url);
const contractData = JSON.parse(Deno.readTextFileSync(contractsUrl));

export interface CtlSeeming {
  readonly name: string;
  readonly favoredRegalia: string;
  readonly blessing: string;
  readonly curse: string;
  readonly description: string;
}

export interface CtlRegalia {
  readonly name: string;
  readonly favoredBy: string;
  readonly description: string;
}

export interface CtlSeemingClause {
  readonly seeming: string;
  readonly effect: string;
}

export interface CtlContract {
  readonly name: string;
  readonly type: "arcadian" | "court" | "goblin";
  readonly regalia: string | null;
  readonly court: string | null;
  readonly tier: "common" | "royal" | "goblin";
  readonly cost: string;
  readonly dicePool: string;
  readonly action: string;
  readonly duration: string;
  readonly effect: string;
  readonly loophole: string;
  readonly seemingClauses: readonly CtlSeemingClause[];
}

export interface CtlKith {
  readonly name: string;
  readonly seeming: string;
  readonly blessing: string;
  readonly description: string;
}

export interface CtlCourt {
  readonly name: string;
  readonly emotion: string;
  readonly mantleNotes: string;
  readonly contractDiscount: string;
  readonly description: string;
}

export const CTL_SEEMINGS: readonly CtlSeeming[] = Object.freeze(
  (data.seemings as CtlSeeming[]).map((s) => Object.freeze({ ...s })),
);

export const CTL_KITHS: readonly CtlKith[] = Object.freeze(
  (data.kiths as CtlKith[]).map((k) => Object.freeze({ ...k })),
);

export const CTL_COURTS: readonly CtlCourt[] = Object.freeze(
  (data.courts as CtlCourt[]).map((c) => Object.freeze({ ...c })),
);

export const CTL_SEEMING_NAMES: readonly string[] = Object.freeze(
  CTL_SEEMINGS.map((s) => s.name),
);

export const CTL_KITH_NAMES: readonly string[] = Object.freeze(
  CTL_KITHS.map((k) => k.name),
);

export const CTL_COURT_NAMES: readonly string[] = Object.freeze(
  CTL_COURTS.map((c) => c.name),
);

export function findSeeming(name: string): CtlSeeming | null {
  const q = name.trim().toLowerCase();
  return CTL_SEEMINGS.find((s) => s.name.toLowerCase() === q) ?? null;
}

export function findKith(name: string): CtlKith | null {
  const q = name.trim().toLowerCase();
  return CTL_KITHS.find((k) => k.name.toLowerCase() === q) ?? null;
}

export function findCourt(name: string): CtlCourt | null {
  const q = name.trim().toLowerCase();
  return CTL_COURTS.find((c) => c.name.toLowerCase() === q) ?? null;
}

export function kithsForSeeming(seeming: string): readonly CtlKith[] {
  const q = seeming.trim().toLowerCase();
  return CTL_KITHS.filter((k) => k.seeming.toLowerCase() === q);
}

// --- Contracts & Regalia (Changeling: The Lost 2e) ---

export const CTL_REGALIA: readonly CtlRegalia[] = Object.freeze(
  (contractData.regalia as CtlRegalia[]).map((r) => Object.freeze({ ...r })),
);

export const CTL_CONTRACTS: readonly CtlContract[] = Object.freeze(
  (contractData.contracts as CtlContract[]).map((c) =>
    Object.freeze({
      ...c,
      seemingClauses: Object.freeze((c.seemingClauses ?? []).map((s) => Object.freeze({ ...s }))),
    })
  ),
);

export const CTL_REGALIA_NAMES: readonly string[] = Object.freeze(
  CTL_REGALIA.map((r) => r.name),
);

export function findRegalia(name: string): CtlRegalia | null {
  const q = name.trim().toLowerCase();
  return CTL_REGALIA.find((r) => r.name.toLowerCase() === q) ?? null;
}

export function findContract(name: string): CtlContract | null {
  const q = name.trim().toLowerCase();
  return CTL_CONTRACTS.find((c) => c.name.toLowerCase() === q) ?? null;
}

/** The favored Regalia for a seeming (e.g. "Fairest" -> "Crown"), or null. */
export function favoredRegaliaForSeeming(seeming: string): string | null {
  const s = findSeeming(seeming);
  return s ? s.favoredRegalia : null;
}

/** All Arcadian contracts of a given Regalia. */
export function contractsByRegalia(regalia: string): readonly CtlContract[] {
  const q = regalia.trim().toLowerCase();
  return CTL_CONTRACTS.filter((c) => c.type === "arcadian" && (c.regalia ?? "").toLowerCase() === q);
}

/** All Court contracts of a given seasonal court. */
export function contractsByCourt(court: string): readonly CtlContract[] {
  const q = court.trim().toLowerCase();
  return CTL_CONTRACTS.filter((c) => c.type === "court" && (c.court ?? "").toLowerCase() === q);
}

/** All Goblin contracts. */
export function goblinContracts(): readonly CtlContract[] {
  return CTL_CONTRACTS.filter((c) => c.type === "goblin");
}
