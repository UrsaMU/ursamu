/**
 * Scene breaks: clear edge-used flags; optional DoT tick.
 */
import type { ISprawlChar } from "../db/schemas.ts";
import { tickDots } from "./dots.ts";
import { applyResilience } from "./action.ts";
import { resetHullScene } from "./hull-specials.ts";

export type SceneResetOpts = {
  /** Tick fire/acid clocks once (default false). */
  tickDots?: boolean;
  /** Clear cyberlimb glitch fault? default false */
  clearLimbFault?: boolean;
};

export type SceneResetResult = {
  next: ISprawlChar;
  lines: string[];
};

/** New scene / encounter for one sheet. */
export function resetSceneFlags(
  c: ISprawlChar,
  opts: SceneResetOpts = {},
): SceneResetResult {
  const lines: string[] = [];
  let next: ISprawlChar = {
    ...c,
    edgeUsedScene: false,
    edgeUsedEncounter: false,
  };
  lines.push("edge scene/encounter uses cleared");

  // Fresh scene — wipe tracked NPC fights (DS clocks)
  if (next.sceneNpcs && Object.keys(next.sceneNpcs).length) {
    const n = Object.keys(next.sceneNpcs).length;
    delete next.sceneNpcs;
    lines.push(`cleared ${n} scene NPC fight(s)`);
  }

  if (opts.tickDots) {
    const t = tickDots(next, applyResilience);
    next = t.next;
    if (t.lines.length) {
      lines.push(...t.lines.map((L) => `DoT ${L}`));
    } else {
      lines.push("no active DoT");
    }
  }

  if (opts.clearLimbFault && next.limbFault) {
    delete next.limbFault;
    lines.push("limb fault cleared");
  }

  // Hyperion multi-action counter
  const before = next.net?.hacksThisScene;
  next = resetHullScene(next);
  if (before) lines.push("net action counter reset");

  return { next, lines };
}
