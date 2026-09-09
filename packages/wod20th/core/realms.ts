// core/realms.ts -- safe lookup helpers for the Umbral Realm catalog.
import { WTA_REALMS, type IRealmDef } from "../splats/wta/data/realms.ts";

/** Lookup with own-property guard (no prototype pollution). */
export function getRealm(slug: string): IRealmDef | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(WTA_REALMS, key)) return undefined;
  return WTA_REALMS[key];
}

export function allRealms(): IRealmDef[] {
  return Object.values(WTA_REALMS);
}

export function realmsByDepth(depth: "near" | "deep"): IRealmDef[] {
  return allRealms().filter((r) => r.depth === depth);
}
