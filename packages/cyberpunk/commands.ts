// Command modules — each import triggers addCmd() calls at module load.

import { registerCmdMiddleware, dbojs } from "@ursamu/ursamu";
import { runWithMode } from "./commands/chargen.ts";

/**
 * Glyph-mode middleware: read the runner's `utf8` flag and set the glyph
 * mode (via AsyncLocalStorage) before the command pipeline runs. Mode resets
 * automatically when the ALS scope exits, so async work after the command
 * and multi-recipient broadcasts default back to ascii.
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
import "./commands/chargen-steps.ts";
import "./commands/rolls.ts";
import "./commands/combat.ts";
import "./commands/npc.ts";
import "./commands/wounds.ts";
import "./commands/cyberware.ts";
import "./commands/armor.ts";
import "./commands/economy.ts";
import "./commands/reputation.ts";
import "./commands/roles.ts";
import "./commands/netrunning.ts";
import "./commands/crafting.ts";
import "./commands/market.ts";
import "./commands/chopshop.ts";
import "./commands/bodysculpt.ts";
import "./commands/pharma.ts";
import "./commands/therapy.ts";
import "./commands/jobs.ts";
import "./commands/run.ts";
import "./commands/scavenge.ts";
import "./commands/improve.ts";
import "./commands/admin.ts";
import "./commands/environment.ts";
import "./commands/rest.ts";
import "./commands/fnff.ts";
import "./commands/brawl.ts";
import "./commands/humanity.ts";
import "./commands/pack.ts";
import "./commands/look.ts";
import "./commands/gear.ts";
import "./commands/scrap.ts";
import "./commands/market-consign.ts";
import "./commands/market-want.ts";
import "./commands/bench.ts";
import "./commands/sourcing.ts";
import "./commands/income.ts";
import "./commands/ammo.ts";
import "./commands/grenade.ts";
import "./commands/effects.ts";
