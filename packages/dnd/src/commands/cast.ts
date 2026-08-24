/**
 * +cast — catalog spells, concentration, combat turn advance.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { currentActor } from "@ursamu/combat";
import { migrateSheet, type DndSheet } from
  "../stats/dnd_sheet.ts";
import { startConcentration } from "../stats/concentration.ts";
import { spellBySlug } from "../data/catalog.ts";
import {
  passAndWalk,
  roomEncounter,
  roomIdOf,
} from "../combat/session.ts";
import { resolveSpell } from "./cast-resolve.ts";

function knowsSpell(sheet: DndSheet, slug: string): boolean {
  const t = slug.toLowerCase();
  return sheet.spells.some((s) => {
    const n = s.toLowerCase();
    return n.replace(/\s+/g, "_") === t ||
      n === t.replace(/_/g, " ");
  });
}

addCmd({
  name: "+cast",
  pattern: /^\+cast\s+([^=]+?)(?:\s+on\s+(.+))?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+cast <spell> [on <target>]  -- Cast a known spell.

Examples:
  +cast Cure Wounds
  +cast Guiding Bolt on Orc
  +cast Hex on Bandit

See: +help cast`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const spellArg = u.util.stripSubs(u.cmd.args[0] || "")
      .trim();
    const targetArg = u.util.stripSubs(u.cmd.args[1] || "")
      .trim();

    const enc = await roomEncounter(roomId);
    const inCombat = !!(enc && enc.status === "active");
    if (inCombat && enc) {
      const cur = currentActor(enc);
      if (!cur || cur.actorId !== u.me.id) {
        u.send("It is not your turn.");
        return;
      }
    }

    let caster = migrateSheet(
      // deno-lint-ignore no-explicit-any
      (u.me.state as any).dnd,
    );
    const spell = spellBySlug(spellArg);
    if (!spell) {
      u.send(
        `Unknown spell "${spellArg}". ` +
          `See +help cast for known spells.`,
      );
      return;
    }

    const isMonster = caster.class === "Monster";
    if (!isMonster && !knowsSpell(caster, spell.slug)) {
      u.send(`You do not know the spell "${spell.name}".`);
      return;
    }

    const slotLevel = Math.max(0, spell.level);
    if (slotLevel > 0 && !isMonster) {
      const have = caster.spellSlotsCurrent[slotLevel] ?? 0;
      if (have <= 0) {
        u.send(
          `No Level ${slotLevel} spell slots remaining.`,
        );
        return;
      }
      caster.spellSlotsCurrent[slotLevel] = have - 1;
    }

    let targetObj = u.me;
    if (targetArg) {
      const found = await u.util.target(u.me, targetArg);
      if (!found || found.location !== roomId) {
        u.send("That target is not here.");
        return;
      }
      targetObj = found;
    }

    // deno-lint-ignore no-explicit-any
    if (!(targetObj.state as any)?.dnd) {
      u.send("That target does not have a character sheet.");
      return;
    }

    if (spell.concentration) {
      caster = startConcentration(
        caster,
        spell.slug,
        targetObj.id,
      );
    }

    await u.db.modify(u.me.id, "$set", { "data.dnd": caster });
    // deno-lint-ignore no-explicit-any
    (u.me.state as any).dnd = caster;

    const nameA = u.util.displayName(u.me, u.me);
    const nameT = u.util.displayName(targetObj, u.me);
    await resolveSpell(
      u,
      spell,
      caster,
      targetObj,
      nameA,
      nameT,
      enc?.id,
    );

    if (inCombat && enc) {
      await passAndWalk(u, enc.id, u.me.id);
    }
  },
});
