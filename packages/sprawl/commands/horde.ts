/**
 * +horde — optional Hollywood Hordes (mob DS = headcount).
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  OK,
  bad,
  dim,
  footer,
  header,
  val,
  ylw,
} from "./chrome.ts";
import {
  clearHorde,
  getHorde,
  hordeDs,
  spawnHorde,
} from "../engine/hordes.ts";
import {
  isStaff,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";

addCmd({
  name: "+horde",
  pattern: /^\+horde(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+horde[/<switch>] [args]  — Hollywood Hordes (optional).

A mob has DS = living members. Damage drops punks 1:1.
Attack with +attack horde (or +attack mob).

Switches:
  (none)              Show active horde.
  /spawn <n> [name]   Create mob (you or staff).
  /clear              Wipe the horde.

Examples:
  +horde/spawn 8 street punks
  +attack horde
  +horde
  +horde/clear`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }

    if (!sw) {
      const h = getHorde(c);
      if (!h) {
        u.send(
          `${ARR}No horde. ${val("+horde/spawn 8 punks")}`,
        );
        return;
      }
      u.send(
        [
          header("HORDE"),
          `  ${ylw(h.name)}  ${val(h.size)}/${val(h.sizeMax)}` +
          `  DS${val(h.size)}`,
          `  ${dim("+attack horde  ·  dmg = punks down")}`,
          footer("SPRAWL"),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "clear" || sw === "wipe") {
      await saveChar(u, clearHorde(c));
      u.send(`${OK}Horde cleared.`);
      return;
    }

    if (sw === "spawn" || sw === "new" || sw === "set") {
      const parts = arg.split(/\s+/).filter(Boolean);
      const n = Number(parts[0]);
      if (!Number.isFinite(n) || n < 1) {
        u.send(
          `${ERR}Usage: ${val("+horde/spawn <n> [name]")}`,
        );
        return;
      }
      // Anyone can spawn a fight they're facing; staff ok too
      void isStaff;
      const name = parts.slice(1).join(" ") || "street punks";
      const next = spawnHorde(c, name, n);
      await saveChar(u, next);
      const h = next.horde!;
      u.send(
        `${OK}Horde ${ylw(h.name)} ×${val(h.size)}` +
          ` (DS${val(h.size)}) — ${val("+attack horde")}`,
      );
      return;
    }

    if (sw === "ds") {
      const d = hordeDs(c);
      u.send(
        d != null
          ? `  Horde DS ${val(d)}`
          : `${ARR}No horde.`,
      );
      return;
    }

    u.send(`${ERR}Switches: /spawn /clear`);
    void bad;
  },
});
