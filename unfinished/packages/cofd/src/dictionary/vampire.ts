// Typed re-exports of Vampire: The Requiem 2e clans, covenants,
// disciplines, and Mask/Dirge archetypes.

import data from "../../resources/vampire.json" with { type: "json" };

export interface VtrClan {
  readonly name: string;
  readonly disciplines: readonly string[];
  readonly bane: string;
  readonly description: string;
}

export interface VtrCovenant {
  readonly name: string;
  readonly mechanic: string;
  readonly description: string;
}

export interface VtrDiscipline {
  readonly name: string;
  readonly summary: string;
  readonly inClanFor: readonly string[];
}

export interface VtrAnchor {
  readonly name: string;
  readonly description: string;
}

const freezeAll = <T extends object>(items: T[]): readonly T[] =>
  Object.freeze(items.map((i) => Object.freeze({ ...i })));

export const VTR_CLANS: readonly VtrClan[] = Object.freeze(
  (data.clans as VtrClan[]).map((c) =>
    Object.freeze({
      ...c,
      disciplines: Object.freeze([...c.disciplines]),
    })
  ),
);

export const VTR_COVENANTS: readonly VtrCovenant[] = freezeAll(
  data.covenants as VtrCovenant[],
);

export const VTR_DISCIPLINES: readonly VtrDiscipline[] = Object
  .freeze(
    (data.disciplines as VtrDiscipline[]).map((d) =>
      Object.freeze({
        ...d,
        inClanFor: Object.freeze([...d.inClanFor]),
      })
    ),
  );

export const VTR_MASK_DIRGE: readonly VtrAnchor[] = freezeAll(
  data.maskDirgeArchetypes as VtrAnchor[],
);

export const VTR_CLAN_NAMES: readonly string[] = Object.freeze(
  VTR_CLANS.map((c) => c.name),
);

export const VTR_COVENANT_NAMES: readonly string[] = Object.freeze(
  VTR_COVENANTS.map((c) => c.name),
);

export const VTR_DISCIPLINE_NAMES: readonly string[] = Object.freeze(
  VTR_DISCIPLINES.map((d) => d.name),
);

export const VTR_MASK_DIRGE_NAMES: readonly string[] = Object.freeze(
  VTR_MASK_DIRGE.map((a) => a.name),
);

export function findClan(name: string): VtrClan | null {
  const q = name.trim().toLowerCase();
  return VTR_CLANS.find((c) => c.name.toLowerCase() === q) ?? null;
}

export function findCovenant(name: string): VtrCovenant | null {
  const q = name.trim().toLowerCase();
  return VTR_COVENANTS.find((c) => c.name.toLowerCase() === q) ??
    null;
}

export function findDiscipline(name: string): VtrDiscipline | null {
  const q = name.trim().toLowerCase();
  return VTR_DISCIPLINES.find((d) => d.name.toLowerCase() === q) ??
    null;
}

export function findMaskDirge(name: string): VtrAnchor | null {
  const q = name.trim().toLowerCase();
  return VTR_MASK_DIRGE.find((a) => a.name.toLowerCase() === q) ??
    null;
}

/** In-clan Discipline names for a clan (canonical casing). */
export function inClanDisciplines(
  clan: string,
): readonly string[] {
  const c = findClan(clan);
  return c?.disciplines ?? [];
}

export function isInClanDiscipline(
  clan: string,
  discipline: string,
): boolean {
  const q = discipline.trim().toLowerCase();
  return inClanDisciplines(clan).some(
    (d) => d.toLowerCase() === q,
  );
}

/** Power key for sheet.powers (lowercase). */
export function disciplinePowerKey(name: string): string {
  return name.trim().toLowerCase();
}
