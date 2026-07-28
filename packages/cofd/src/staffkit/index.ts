// Registry of staff splat kits.

import { buildChangelingKit } from "./changeling.ts";
import type { StaffKitBuilder, StaffKitResult } from "./types.ts";

export type { StaffKitResult } from "./types.ts";
export { buildChangelingKit } from "./changeling.ts";

const KITS: Record<string, StaffKitBuilder> = {
  changeling: buildChangelingKit,
  lost: buildChangelingKit,
  ctl: buildChangelingKit,
  fae: buildChangelingKit,
};

/** Canonical kit keys shown in /list (no aliases). */
export const STAFF_KIT_KEYS = ["changeling"] as const;

export function listStaffKits(): string[] {
  return [...STAFF_KIT_KEYS];
}

export function resolveStaffKit(
  raw: string,
): StaffKitResult | null {
  const key = raw.toLowerCase().trim();
  if (!key) return null;
  const build = KITS[key];
  if (!build) return null;
  return build();
}

export function isKnownStaffKit(raw: string): boolean {
  return !!KITS[raw.toLowerCase().trim()];
}
