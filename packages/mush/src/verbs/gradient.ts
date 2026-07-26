/**
 * +gradient — preview or set a smooth multi-stop name gradient.
 *
 * Colors: hex (#RGB / #RRGGBB / RRGGBB) or common names (red, cyan, …).
 * Output uses truecolor codes: <#RRGGBB> per character.
 */

import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import {
  parseColor,
  gradientText,
  splitColors,
  type Rgb,
} from "./gradient-colors.ts";

export {
  parseColor,
  sampleGradient,
  gradientText,
  splitColors,
} from "./gradient-colors.ts";
export type { Rgb } from "./gradient-colors.ts";

function actorName(u: IUrsamuSDK): string {
  const raw = String(u.me.state?.name || u.me.name || "Unknown");
  return u.util.stripSubs(raw).trim() || "Unknown";
}

function parseStops(u: IUrsamuSDK, raw: string): Rgb[] | null {
  const parts = splitColors(raw);
  if (parts.length < 2) {
    u.send(
      "Usage: +gradient <color>, <color>[, <color>...]\n" +
        "Need at least two colors (hex or name).",
    );
    return null;
  }
  if (parts.length > 12) {
    u.send("Too many colors (max 12).");
    return null;
  }

  const stops: Rgb[] = [];
  for (const p of parts) {
    const rgb = parseColor(p);
    if (!rgb) {
      u.send(
        `Unknown color '%ch${u.util.stripSubs(p)}%cn'. ` +
          `Use hex (#ff00aa) or a name (red, cyan, gold…).`,
      );
      return null;
    }
    stops.push(rgb);
  }
  return stops;
}

async function applyGradient(
  u: IUrsamuSDK,
  stops: Rgb[],
  save: boolean,
): Promise<void> {
  const name = actorName(u);
  const painted = gradientText(name, stops);

  if (!save) {
    u.send(`Preview: ${painted}`);
    u.send(
      "To wear it: %ch+gradient/set <colors>%cn  ·  " +
        "Clear: %ch+gradient/clear%cn",
    );
    return;
  }

  await u.db.modify(u.me.id, "$set", { "data.moniker": painted });
  u.send(`Moniker set: ${painted}`);
}

addCmd({
  name: "+gradient",
  pattern: /^\+gradient(?:\/(set|clear|preview))?\s*(.*)/i,
  lock: "connected",
  category: "General",
  help:
    `+gradient <c1>, <c2>[, <c3>...]  — Name color gradient preview.
+gradient/set <c1>, <c2>[, ...]    — Save as your moniker.
+gradient/clear                    — Clear moniker.

Colors: hex (#f0a, #ff00aa) or names (red, blue, gold, cyan…).
At least two colors. Blends smoothly across your name.

Examples:
  +gradient red, blue
  +gradient #ff0000, #00ff00, #0000ff
  +gradient/set orange, pink, purple
  +gradient/clear`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "clear") {
      await u.db.modify(u.me.id, "$unset", { "data.moniker": "" });
      u.send("Moniker cleared. Your plain name will show again.");
      return;
    }

    const stops = parseStops(u, arg);
    if (!stops) return;

    await applyGradient(u, stops, sw === "set");
  },
});
