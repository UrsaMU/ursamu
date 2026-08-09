/**
 * +level — level-up with ASI/feat and optional spell pick.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  DND_ABILITIES,
  migrateSheet,
  type DndAbility,
} from "../stats/dnd_sheet.ts";
import {
  applyAsiChoice,
  applyLevelCore,
  applySpellPick,
  formatLevelReady,
  planLevelUp,
} from "../stats/levelup.ts";
import { calculateSpellSlots } from "./cg.ts";
import { getXpRequired } from "../stats/rules.ts";

addCmd({
  name: "+level",
  pattern: /^\+level(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+level [<class>] — Level up when XP allows.\n` +
    `+level/asi <ability> [2|ability2] — Spend ASI.\n` +
    `+level/feat <name> — Take a feat instead.\n` +
    `+level/spell <name> — Learn a class spell.\n` +
    `+level/status — XP progress.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // deno-lint-ignore no-explicit-any
    if (!(u.me.state as any)?.dnd) {
      u.send("You do not have a character sheet yet.");
      return;
    }
    let sheet = migrateSheet(
      // deno-lint-ignore no-explicit-any
      (u.me.state as any).dnd,
    );

    if (sw === "status" || sw === "xp") {
      u.send(
        `%ch%cgLEVEL>>%cn Level ${sheet.level}. ` +
          formatLevelReady(sheet),
      );
      // deno-lint-ignore no-explicit-any
      if ((sheet as any).pendingAsi) {
        u.send(
          "ASI pending: +level/asi str 2  OR  " +
            "+level/asi str dex  OR  +level/feat Alert",
        );
      }
      return;
    }

    if (sw === "asi") {
      const parts = arg.toLowerCase().split(/\s+/).filter(Boolean);
      if (!parts.length) {
        u.send(
          "Usage: +level/asi strength 2  OR  +level/asi str dex",
        );
        return;
      }
      const parseAb = (s: string): DndAbility | null => {
        const hit = DND_ABILITIES.find((a) =>
          a === s || a.slice(0, 3) === s.slice(0, 3)
        );
        return hit ?? null;
      };
      let choice;
      if (parts.length >= 2 && parts[1] !== "2" && parts[1] !== "1") {
        const a = parseAb(parts[0]!);
        const b = parseAb(parts[1]!);
        if (!a || !b) {
          u.send("Unknown ability. Use str dex con int wis cha.");
          return;
        }
        choice = { type: "asi2" as const, a, b };
      } else {
        const a = parseAb(parts[0]!);
        if (!a) {
          u.send("Unknown ability.");
          return;
        }
        const amount = parts[1] === "1" ? 1 : 2;
        choice = {
          type: "asi" as const,
          ability: a,
          amount: amount as 1 | 2,
        };
      }
      const r = applyAsiChoice(sheet, choice);
      if (!r.ok) {
        u.send(`%ch%cyLEVEL>>%cn ${r.message}`);
        return;
      }
      await u.db.modify(u.me.id, "$set", { "data.dnd": r.sheet });
      u.send(`%ch%cgLEVEL>>%cn ${r.message}`);
      return;
    }

    if (sw === "feat") {
      if (!arg) {
        u.send("Usage: +level/feat <name>");
        return;
      }
      const r = applyAsiChoice(sheet, {
        type: "feat",
        feat: arg,
      });
      if (!r.ok) {
        u.send(`%ch%cyLEVEL>>%cn ${r.message}`);
        return;
      }
      await u.db.modify(u.me.id, "$set", { "data.dnd": r.sheet });
      u.send(`%ch%cgLEVEL>>%cn ${r.message}`);
      return;
    }

    if (sw === "spell" || sw === "learn") {
      if (!arg) {
        u.send("Usage: +level/spell <name>");
        return;
      }
      const r = applySpellPick(sheet, arg);
      if (!r.ok) {
        u.send(`%ch%cyLEVEL>>%cn ${r.message}`);
        return;
      }
      await u.db.modify(u.me.id, "$set", { "data.dnd": r.sheet });
      u.send(`%ch%cgLEVEL>>%cn ${r.message}`);
      return;
    }

    // Core level-up
    if (sw && sw !== "up") {
      // treat sw as class name if not a known switch
      // fall through with classArg = sw
    }
    const classArg = ["", "up"].includes(sw) ? arg : (sw || arg);
    // deno-lint-ignore no-explicit-any
    if ((sheet as any).pendingAsi) {
      u.send(
        "%ch%cyLEVEL>>%cn Finish ASI first: " +
          "+level/asi str 2  or  +level/feat Lucky",
      );
      return;
    }

    const plan = planLevelUp(sheet, classArg || undefined);
    if ("error" in plan) {
      u.send(`%ch%cyLEVEL>>%cn ${plan.error}`);
      return;
    }
    if (!plan.canLevel) {
      u.send(
        `%ch%cyLEVEL>>%cn ${formatLevelReady(sheet)}`,
      );
      return;
    }

    sheet = applyLevelCore(sheet, plan);
    // Prefer cg spell slot calculator when available
    try {
      const slots = calculateSpellSlots(sheet.classes);
      for (let i = 1; i <= 9; i++) {
        sheet.spellSlotsMax[i] = slots[i] || 0;
        sheet.spellSlotsCurrent[i] = slots[i] || 0;
      }
    } catch { /* keep applyLevelCore slots */ }

    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });

    const nextNeed = getXpRequired(plan.nextLevel + 1);
    u.send(
      `%ch%cgLEVEL>>%cn Level %ch${plan.nextLevel}%cn ` +
        `${sheet.class}! +${plan.hpGain} HP ` +
        `(now ${sheet.hp.current}/${sheet.hp.max}).`,
    );
    if (plan.needsAsi) {
      u.send(
        "%ch%cyLEVEL>>%cn ASI or feat: " +
          "%ch+level/asi str 2%cn · " +
          "%ch+level/asi dex con%cn · " +
          "%ch+level/feat Alert%cn",
      );
    }
    if (plan.isCaster && plan.spellOptions.length) {
      const sample = plan.spellOptions.slice(0, 5).join(", ");
      u.send(
        `%ch%cyLEVEL>>%cn Optional spell: ` +
          `%ch+level/spell <name>%cn (e.g. ${sample})`,
      );
    }
    if (Number.isFinite(nextNeed)) {
      u.send(
        `%ch%cgLEVEL>>%cn Next level at ${nextNeed} XP ` +
          `(you have ${sheet.xp || 0}).`,
      );
    }
  },
});
