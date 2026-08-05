// Staff splat kits — minimal live sheets + flags for lock checks.

import type { CofdSheet } from "../stats/sheet.ts";

export interface StaffKitResult {
  /** Canonical splat key (changeling, werewolf, …). */
  splat: string;
  /** Display label for staff messages. */
  label: string;
  /** Live sheet written to data.cofd. */
  sheet: CofdSheet;
  /**
   * Flags to apply via setFlags (space-joined adds).
   * Sight flags should match syncSightFlags for the template.
   */
  flags: string[];
  /** One-line summary of what the kit unlocks. */
  unlocks: string;
}

export type StaffKitBuilder = () => StaffKitResult;
