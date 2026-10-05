// Pure Beat-economy math: conversion and pool updates.
//
// Beats convert to Experience at 5:1. Arcane Beats convert to Arcane
// Experience at the same ratio but on a separate ledger; the two pools never
// commingle (see docs/xp-beats-spec.md s2).

import { migrateSheet, type CofdSheet } from "../stats/sheet.ts";
import { XP_COSTS } from "./costs.ts";

/**
 * Splits a Beat count into whole Experiences plus a remainder under the
 * conversion ratio. Defaults to the table's standard 5:1.
 */
export function convertBeatsToXp(
  beats: number,
  beatsPerXp: number = XP_COSTS.conversion.beatsPerExperience,
): { xp: number; remainder: number } {
  if (beats <= 0 || beatsPerXp <= 0) {
    return { xp: 0, remainder: Math.max(0, beats) };
  }
  return {
    xp: Math.floor(beats / beatsPerXp),
    remainder: beats % beatsPerXp,
  };
}

/**
 * Adds `n` Beats (or Arcane Beats) to the sheet, rolling complete 5-stacks
 * into the matching Experience pool. Pure -- returns a new sheet.
 *
 * Negative `n` is supported for ST corrections; the function never lets a
 * pool fall below zero.
 */
export function addBeats(sheet: CofdSheet, n: number, arcane: boolean): CofdSheet {
  const out = migrateSheet({ ...sheet });
  const ratio = arcane
    ? XP_COSTS.conversion.arcaneBeatsPerArcaneExperience
    : XP_COSTS.conversion.beatsPerExperience;

  if (arcane) {
    const current = out.arcaneBeats ?? 0;
    const xpPool = out.arcaneExperience ?? 0;
    const next = current + n;
    if (next < 0) {
      // Pull from XP if available to honour the correction; floor at zero.
      const owed = -next;
      const newXp = Math.max(0, xpPool - owed);
      out.arcaneBeats = 0;
      out.arcaneExperience = newXp;
      return out;
    }
    const { xp, remainder } = convertBeatsToXp(next, ratio);
    out.arcaneBeats = remainder;
    out.arcaneExperience = xpPool + xp;
    return out;
  }

  const current = out.beats ?? 0;
  const xpPool = out.experience ?? 0;
  const next = current + n;
  if (next < 0) {
    const owed = -next;
    const newXp = Math.max(0, xpPool - owed);
    out.beats = 0;
    out.experience = newXp;
    return out;
  }
  const { xp, remainder } = convertBeatsToXp(next, ratio);
  out.beats = remainder;
  out.experience = xpPool + xp;
  return out;
}
