// Build a fetch sheet from a changeling original (CtL light).

import { defaultSheet, type CofdSheet } from "../stats/index.ts";
import { defaultOwnedEchoes } from "./echoes.ts";
import type { FetchLinkState } from "./types.ts";
import { writeFetchState } from "./store.ts";

export interface BuildFetchOpts {
  originalId: string;
  originalName: string;
  fetchName?: string;
  flaw?: string;
  materials?: string;
  storyMode?: FetchLinkState["storyMode"];
  /** Copy attribute array from original (default true). */
  mirrorAttributes?: boolean;
}

/**
 * Create a fetch template sheet mirrored from a changeling.
 * No Contracts/seeming/kith. Wyrd/Glamour/Integrity; Echoes.
 */
export function buildFetchSheet(
  original: CofdSheet,
  opts: BuildFetchOpts,
): CofdSheet {
  let sheet = defaultSheet();
  sheet.template = "fetch";
  sheet.powerStatValue = Math.max(1, original.powerStatValue || 1);
  sheet.moralityValue = Math.min(
    7,
    Math.max(5, original.moralityValue ?? 7),
  );
  // Glamour pool like Lost
  const maxG = Math.max(10, sheet.powerStatValue * 10);
  sheet.energyCurrent = maxG;

  if (opts.mirrorAttributes !== false) {
    sheet.attributes = { ...original.attributes };
  }
  // Skills diverge over time — copy half as starting point
  sheet.skills = { ...original.skills };
  sheet.advantages = {
    willpowerMax: original.advantages?.willpowerMax ?? 5,
    willpowerCurrent: original.advantages?.willpowerMax ?? 5,
    size: original.advantages?.size ?? 5,
  };

  sheet.customFields = {
    flaw: opts.flaw ?? "Something human never quite fits.",
    materials: opts.materials ?? "detritus and stolen soul-stuff",
  };
  sheet.contracts = [];
  sheet.frailties = [];

  const link: FetchLinkState = {
    originalId: opts.originalId,
    originalName: opts.originalName,
    fetchName: opts.fetchName,
    flaw: opts.flaw ?? sheet.customFields.flaw,
    materials: opts.materials ?? sheet.customFields.materials,
    echoes: defaultOwnedEchoes(sheet.powerStatValue),
    normalcyOn: true,
    metOriginal: false,
    storyMode: opts.storyMode ?? "unknown",
  };
  sheet = writeFetchState(sheet, link);
  return sheet;
}

/** Patch changeling with link to fetch id. */
export function linkChangelingToFetch(
  changeling: CofdSheet,
  fetchId: string,
  fetchName: string,
  extra: Partial<FetchLinkState> = {},
): CofdSheet {
  const prev = changeling.fetchState;
  return writeFetchState(changeling, {
    fetchId,
    fetchName,
    flaw: extra.flaw ?? prev?.flaw,
    materials: extra.materials ?? prev?.materials,
    echoes: [],
    storyMode: extra.storyMode ?? prev?.storyMode ?? "unknown",
  });
}
