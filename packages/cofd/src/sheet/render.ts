// Renders a Chronicles of Darkness character sheet into a MUSH-compatible string.
//
// `formatSheet` is a thin orchestrator that walks a list of section renderers
// in order. Future subsystems (Health, Conditions, Beats, Touchstones, etc.)
// add their own section files under `./sections/` and append themselves to
// `defaultSections` -- no need to touch this file.

import { footer } from "@ursamu/ursamu";
import { migrateSheet, type CofdSheet } from "../stats/sheet.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import {
  defaultSections,
  type SheetSection,
  type SheetContext,
} from "./sections/index.ts";

const WIDTH = 78;

/**
 * Formats a character sheet into a beautiful, template-aware MUSH-compatible string.
 *
 * @param playerName Display name for the character.
 * @param sheet      The CofD sheet record (will be migrated as needed).
 * @param sections   Optional override of which sections to render and in what order.
 */
export async function formatSheet(
  playerName: string,
  actorId: string,
  sheet: CofdSheet,
  sections: SheetSection[] = defaultSections,
  u?: import("@ursamu/ursamu").IUrsamuSDK,
): Promise<string> {
  sheet = migrateSheet(sheet);
  const tKey = sheet.template.toLowerCase().trim();
  const template = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;
  const ctx: SheetContext = { playerName, actorId, sheet, template, width: WIDTH, u };

  const lines: string[] = [];
  for (const section of sections) {
    const sectionLines = await section.render(ctx);
    lines.push(...sectionLines);
  }
  lines.push(await footer());
  return lines.join("\n");
}

export type { SheetSection, SheetContext } from "./sections/index.ts";
export { defaultSections } from "./sections/index.ts";
