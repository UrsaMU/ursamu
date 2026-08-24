// Command modules — each import triggers addCmd() at module load.
import { registerCmdMiddleware, dbojs } from "@ursamu/ursamu";
import { runWithMode } from "./commands/chrome.ts";

/**
 * Glyph-mode middleware: read runner utf8 flag before pipeline.
 */
registerCmdMiddleware(async (ctx, next) => {
  const cid = ctx.socket?.cid;
  let mode: "ascii" | "utf8" = "ascii";
  if (cid) {
    const en = await dbojs.queryOne({ id: cid });
    const fl: unknown = en?.flags;
    let hasUtf8 = false;
    if (typeof fl === "string") {
      hasUtf8 = fl.split(/\s+/).includes("utf8");
    } else if (fl && typeof fl === "object" && "has" in (fl as object)) {
      hasUtf8 = (fl as Set<string>).has("utf8");
    }
    if (hasUtf8) mode = "utf8";
  }
  await runWithMode(mode, () => next());
});

import "./commands/utf8.ts";
import "./commands/sheet.ts";
import "./commands/chargen.ts";
import "./commands/roll.ts";
import "./commands/attack.ts";
import "./commands/combat.ts";
import "./commands/hazards.ts";
import "./commands/tactics.ts";
import "./commands/gear.ts";
import "./commands/gear-slots.ts";
import "./commands/market.ts";
import "./commands/hack.ts";
import "./commands/paradox.ts";
import "./commands/drugs.ts";
import "./commands/vehicle.ts";
import "./commands/flow.ts";
import "./commands/advance.ts";
import "./commands/staff.ts";
import "./commands/gig.ts";
import "./commands/dot.ts";
import "./commands/drone.ts";
import "./commands/range.ts";
import "./commands/scene.ts";
import "./commands/horde.ts";
import "./commands/lexicon.ts";
import "./commands/desc.ts";
