// Fetch link state on CofdSheet.

import type { CofdSheet } from "../stats/sheet.ts";
import type { FetchLinkState } from "./types.ts";

export function readFetchState(
  sheet: CofdSheet,
): FetchLinkState | null {
  const f = sheet.fetchState;
  if (!f || typeof f !== "object") return null;
  return {
    fetchId: f.fetchId,
    fetchName: f.fetchName,
    flaw: f.flaw,
    materials: f.materials,
    originalId: f.originalId,
    originalName: f.originalName,
    echoes: Array.isArray(f.echoes) ? [...f.echoes] : [],
    normalcyOn: f.normalcyOn !== false,
    metOriginal: f.metOriginal === true,
    storyMode: f.storyMode,
  };
}

export function writeFetchState(
  sheet: CofdSheet,
  state: FetchLinkState | null,
): CofdSheet {
  if (!state) {
    return { ...sheet, fetchState: undefined };
  }
  return { ...sheet, fetchState: { ...state } };
}

export function isFetchSheet(sheet: CofdSheet): boolean {
  return (sheet.template ?? "").toLowerCase() === "fetch";
}

export function hasFetchLink(sheet: CofdSheet): boolean {
  const f = readFetchState(sheet);
  return !!(f?.fetchId || f?.originalId);
}
