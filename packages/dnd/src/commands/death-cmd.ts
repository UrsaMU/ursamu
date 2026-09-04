/**
 * +deathsave / +ds / +res — dying, death, resurrection.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import {
  formatDeathStatus,
  rollDeathSave,
  stabilize,
} from "../stats/vitality.ts";
import {
  isPlayerCorpse,
  maybeProcessPlayerDeath,
} from "../stats/player-death.ts";
import {
  cheapSelfRes,
  resurrectPlayer,
} from "../stats/resurrect.ts";
import { roomIdOf } from "../combat/session.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+deathsave",
  pattern: /^\+(?:deathsave|ds)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+ds — Death saving throw at 0 HP.

Switches:
  /status       Show death track
  /stabilize [who]  Stabilize at 0 HP

At 3 failures you die: corpse + Grey Veil.
Allies: +res <corpse>  |  Cheap: +res me

Examples:
  +ds
  +ds/status
  +ds/stabilize`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "status" || sw === "stat") {
      const sheet = migrateSheet((u.me.state as Any)?.dnd);
      u.send(
        `${formatDeathStatus(sheet)} ` +
          `(${sheet.hp.current}/${sheet.hp.max} HP)`,
      );
      return;
    }

    if (sw === "stabilize" || sw === "stable") {
      let target = u.me;
      if (arg) {
        const t = await u.util.target(u.me, arg);
        if (!t) {
          u.send("Not found.");
          return;
        }
        if (
          t.id !== u.me.id &&
          !(await u.canEdit(u.me, t)) &&
          !isStaff(u)
        ) {
          u.send("Permission denied.");
          return;
        }
        target = t;
      }
      let sheet = migrateSheet((target.state as Any)?.dnd);
      const r = stabilize(sheet);
      sheet = r.sheet;
      await u.db.modify(target.id, "$set", { "data.dnd": sheet });
      for (const ln of r.lines) {
        u.send(ln);
      }
      return;
    }

    let sheet = migrateSheet((u.me.state as Any)?.dnd);
    if (!sheet) {
      u.send("No character sheet.");
      return;
    }
    const r = rollDeathSave(sheet);
    sheet = r.sheet;
    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
    if (u.me.state) (u.me.state as Any).dnd = sheet;
    for (const ln of r.lines) {
      u.send(ln);
    }
    if (sheet.death?.dead) {
      const death = await maybeProcessPlayerDeath(
        u,
        u.me,
        sheet,
      );
      for (const ln of death.lines) {
        if (!r.lines.includes(ln)) u.send(ln);
      }
    }
  },
});

addCmd({
  name: "+res",
  pattern: /^\+(?:res|rez|resurrect)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+res <corpse|me|player>  — Raise the dead.

FULL RAISE (keep gear)
  Ally at the body: +res <corpse>
  Staff: +res <player>

CHEAP SELF (+res me)
  Return home alone. Gear stays on corpse.
  Lose ~10% XP and ~10% of your coin purse
  (cp/sp/ep/gp/pp — not only gp).

Examples:
  +res corpse of Alice
  +res me
  +res Alice`,
  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(
      (u.cmd.args[1] || u.cmd.args[0] || "").trim(),
    );
    const arg = raw.toLowerCase();

    // +res / +res me / +res self — cheap path from the Veil
    if (
      !raw ||
      arg === "me" ||
      arg === "self" ||
      arg === "here"
    ) {
      const r = await cheapSelfRes(u, u.me);
      if (!r.ok) u.send(r.message);
      return;
    }

    const roomId = roomIdOf(u);
    const target = await u.util.target(u.me, raw);
    if (!target) {
      u.send("Not found.");
      return;
    }

    // Full raise from corpse
    if (isPlayerCorpse(target)) {
      if (
        roomId &&
        target.location !== roomId &&
        !isStaff(u)
      ) {
        u.send("That corpse is not here.");
        return;
      }
      const r = await resurrectPlayer(u, { corpse: target });
      if (!r.ok) u.send(r.message);
      return;
    }

    // Player target
    if (target.flags?.has?.("player")) {
      // Self by name while dead → cheap
      if (target.id === u.me.id) {
        const r = await cheapSelfRes(u, u.me);
        if (!r.ok) u.send(r.message);
        return;
      }
      if (!isStaff(u)) {
        u.send(
          "Find their corpse and +res it, or ask staff. " +
            "They may +res me for a costly home return.",
        );
        return;
      }
      // Staff full raise
      const r = await resurrectPlayer(u, { spirit: target });
      if (!r.ok) u.send(r.message);
      return;
    }

    u.send("That is not a player corpse or spirit.");
  },
});
