/** +dot — fire/acid ongoing damage clocks. */
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
import { applyResilience } from "../engine/action.ts";
import {
  addDot,
  clearDots,
  listDots,
  tickDots,
} from "../engine/dots.ts";
import {
  getChar,
  isStaff,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";

addCmd({
  name: "+dot",
  pattern: /^\+dot(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+dot[/<switch>] [args]  — Fire/acid DoT clocks.

Hellfire/acid hits auto-ignite PCs (first tick now).
Your DoTs also tick automatically each +attack.

Switches:
  (none)              Show your active DoTs.
  /tick [player]      Manual tick (self or staff).
  /apply <kind> <n>   Force fire|acid for n rounds.
  /clear [player]     Clear all DoTs.

Examples:
  +dot
  +dot/tick
  +dot/apply fire 3
  +dot/clear`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw) {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const dots = listDots(c);
      const lines = [header("DoT")];
      if (!dots.length) {
        lines.push(`  ${dim("none")}`);
      } else {
        for (const d of dots) {
          lines.push(
            `  ${ylw(d.kind)} −${val(d.dmg)}/rd` +
              ` ×${val(d.rounds)}` +
              (d.source ? ` ${dim(d.source)}` : ""),
          );
        }
        lines.push(`  ${dim("+dot/tick to resolve a round")}`);
      }
      lines.push(footer("SPRAWL"));
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "tick") {
      let target = u.me;
      if (arg) {
        if (!isStaff(u)) {
          u.send(`${ERR}Staff only for others.`);
          return;
        }
        const t = await u.util.target(u.me, arg, true);
        if (!t) {
          u.send(`${ERR}Not found.`);
          return;
        }
        target = t;
      }
      const c = getChar(target);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const r = tickDots(c, applyResilience);
      await saveChar(u, r.next, target.id);
      if (!r.lines.length) {
        u.send(`${ARR}No active DoT.`);
        return;
      }
      u.send(
        [
          header("DoT TICK"),
          ...r.lines.map((L) => `  ${L}`),
          `  Res ${val(r.next.resilience)}` +
          `/${val(r.next.resilienceMax)}` +
          (r.next.resilience <= 0
            ? ` ${bad("RES 0")}`
            : ""),
          footer("SPRAWL"),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "apply" || sw === "set") {
      const parts = arg.split(/\s+/).filter(Boolean);
      const kind = (parts[0] ?? "fire").toLowerCase();
      const rounds = Number(parts[1] ?? 3);
      if (!Number.isFinite(rounds) || rounds < 1) {
        u.send(
          `${ERR}Usage: ${val("+dot/apply fire|acid <rounds>")}`,
        );
        return;
      }
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const next = addDot(c, {
        kind: kind === "acid" ? "acid" : "fire",
        rounds: Math.min(12, Math.floor(rounds)),
        dmg: 1,
      });
      await saveChar(u, next);
      u.send(
        `${OK}${ylw(kind)} DoT ×${val(Math.floor(rounds))}` +
          ` — ${val("+dot/tick")}`,
      );
      return;
    }

    if (sw === "clear") {
      let target = u.me;
      if (arg) {
        if (!isStaff(u)) {
          u.send(`${ERR}Staff only for others.`);
          return;
        }
        const t = await u.util.target(u.me, arg, true);
        if (!t) {
          u.send(`${ERR}Not found.`);
          return;
        }
        target = t;
      }
      const c = getChar(target);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      await saveChar(u, clearDots(c), target.id);
      u.send(`${OK}DoTs cleared.`);
      return;
    }

    u.send(`${ERR}Switches: /tick /apply /clear`);
  },
});
