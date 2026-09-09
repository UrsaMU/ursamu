// commands/embrace.ts -- +embrace / +ghoul staff creation.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { embraceMortal, makeGhoul } from "../core/embrace.ts";
import { isKindred } from "../core/kindred.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { frame } from "../core/format.ts";
import {
  applyGhoulWithdrawal,
  feedGhoulVitae,
  ghoulStatus,
  setGhoulDiscipline,
  ungoul,
} from "../core/ghoul.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

async function resolveSireAndTarget(
  u: IUrsamuSDK,
  rest: string,
): Promise<{
  sire: Awaited<ReturnType<typeof findByPlayer>>;
  target: Awaited<ReturnType<typeof findByPlayer>>;
  // deno-lint-ignore no-explicit-any
  targetObj: any | null;
  err?: string;
}> {
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 1) {
    return {
      sire: null,
      target: null,
      targetObj: null,
      err: "need target",
    };
  }
  // +embrace <childe>  -- sire = staff's char if Kindred, else need 2 args
  // +embrace <sire> <childe>
  let sireObj = u.me;
  let childeName = parts[0];
  if (parts.length >= 2) {
    const s = await u.util.target(u.me, parts[0], true);
    if (!s) {
      return {
        sire: null,
        target: null,
        targetObj: null,
        err: "Sire not found.",
      };
    }
    sireObj = s;
    childeName = parts.slice(1).join(" ");
  }
  const childeObj = await u.util.target(u.me, childeName, true);
  if (!childeObj) {
    return {
      sire: null,
      target: null,
      targetObj: null,
      err: "Childe not found.",
    };
  }
  if (!(await u.canEdit(u.me, childeObj))) {
    return {
      sire: null,
      target: null,
      targetObj: null,
      err: "Permission denied.",
    };
  }
  const sire = await findByPlayer(sireObj.id);
  const target = await findByPlayer(childeObj.id);
  return { sire, target, targetObj: childeObj };
}

addCmd({
  name: "+embrace",
  pattern: /^\+embrace(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+embrace[/switch]  -- Embrace, ghouls, vitae maintenance.

SYNTAX
  +embrace <mortal>              (Staff) Sire = your Kindred.
  +embrace <sire> <mortal>       (Staff) Named sire.
  +embrace/ghoul <mortal>        (Staff) Create ghoul.
  +embrace/vitae <ghoul>         Domitor feeds 1 BP vitae.
  +embrace/disc <ghoul>=<Disc>   (Staff) Set ghoul Discipline 1.
  +embrace/status [<ghoul>]      Ghoul dependency status.
  +embrace/withdraw <ghoul>      (Staff) Force withdrawal.
  +embrace/ungoul <ghoul>        (Staff) Clear ghoul state.

SEE ALSO: +help bond, +help blood, +help diablerie`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- vitae: domitor (or staff) feeds ghoul ----------------------------
    if (sw === "vitae") {
      const me = await findByPlayer(u.me.id);
      if (!me || !isKindred(me)) {
        u.send("Only Kindred feed ghouls vitae.");
        return;
      }
      if (!rest) {
        u.send("Usage: +embrace/vitae <ghoul>");
        return;
      }
      const t = await u.util.target(u.me, rest, true);
      if (!t) {
        u.send("Ghoul not found.");
        return;
      }
      const g = await findByPlayer(t.id);
      if (!g) {
        u.send("No character.");
        return;
      }
      const r = feedGhoulVitae(me, g, 1);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(me);
      await saveChar(g);
      u.send(`%cg${r.message}%cn`);
      u.send("%cyYour domitor feeds you vitae.%cn", t.id);
      return;
    }

    if (sw === "status") {
      const me = await findByPlayer(u.me.id);
      let g = me;
      if (rest) {
        const t = await u.util.target(u.me, rest, true);
        if (!t) {
          u.send("Not found.");
          return;
        }
        g = await findByPlayer(t.id);
      }
      if (!g) {
        u.send("No character.");
        return;
      }
      const st = ghoulStatus(g);
      if (!st.isGhoul) {
        u.send("Not a ghoul.");
        return;
      }
      u.send(frame("Ghoul Status", [
        `  Ghoul BP: ${st.bloodPool}/${st.bloodMax}`,
        `  Domitor:  ${st.domitorId ?? "?"}`,
        `  Days since vitae: ${st.daysSinceFed ?? "never"}`,
        `  Withdrawal: ${st.inWithdrawal ? "%crYES%cn" : "%cgno%cn"}`,
        `  Discs: ${
          Object.entries(st.disciplines)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ") || "(none)"
        }`,
      ]));
      return;
    }

    if (sw === "disc" || sw === "withdraw" || sw === "ungoul") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      if (sw === "disc") {
        const eq = rest.indexOf("=");
        if (eq < 1) {
          u.send("Usage: +embrace/disc <ghoul>=<Discipline>");
          return;
        }
        const t = await u.util.target(u.me, rest.slice(0, eq).trim(), true);
        if (!t) {
          u.send("Not found.");
          return;
        }
        const g = await findByPlayer(t.id);
        if (!g) {
          u.send("No character.");
          return;
        }
        const r = setGhoulDiscipline(g, rest.slice(eq + 1).trim(), 1);
        if (!r.ok) {
          u.send(`%cr${r.message}%cn`);
          return;
        }
        await saveChar(g);
        u.send(`%cg${r.message}%cn`);
        return;
      }
      const t = await u.util.target(u.me, rest, true);
      if (!t) {
        u.send("Not found.");
        return;
      }
      const g = await findByPlayer(t.id);
      if (!g) {
        u.send("No character.");
        return;
      }
      const r = sw === "withdraw"
        ? applyGhoulWithdrawal(g, true)
        : ungoul(g);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(g);
      u.send(`%cg${r.message}%cn`);
      return;
    }

    // -- create embrace / ghoul (staff) -----------------------------------
    if (!isStaff(u)) {
      u.send("%crPermission denied.%cn");
      return;
    }
    if (!rest && !sw) {
      u.send("Usage: +embrace <childe>  or  +embrace/ghoul <tgt>");
      return;
    }

    const ghoul = sw === "ghoul";
    const resolved = await resolveSireAndTarget(
      u,
      ghoul ? rest : (rest || sw),
    );
    if (resolved.err) {
      u.send(`%cr${resolved.err}%cn`);
      return;
    }
    if (!resolved.sire || !isKindred(resolved.sire)) {
      u.send("Sire/domitor must be Kindred on file.");
      return;
    }
    if (!resolved.target || !resolved.targetObj) {
      u.send("Target has no character on file.");
      return;
    }

    const r = ghoul
      ? makeGhoul(resolved.sire, resolved.target)
      : embraceMortal(resolved.sire, resolved.target);
    if (!r.ok) {
      u.send(`%cr${r.message}%cn`);
      return;
    }
    await saveChar(resolved.target);
    const name = u.util.displayName(resolved.targetObj, u.me);
    u.send(`%cg${name}: ${r.message}%cn`);
    poseRoom(
      u,
      ghoul
        ? `%cy${name}%cn tastes vitae and is bound as a ghoul.`
        : `%cr${name}%cn dies and rises -- Embraced.`,
    );
    u.send(
      ghoul
        ? "%cyYou are ghouled. Serve your domitor.%cn"
        : "%crThe Embrace takes you. You are Kindred now.%cn",
      resolved.targetObj.id,
    );
  },
});
