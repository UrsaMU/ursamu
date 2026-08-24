/** +fall +drown +explode — specialty hazard helpers. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
  bad,
  header,
  divider,
  val,
} from "./chrome.ts";
import {
  applyResilience,
  gatherBonuses,
  resolveAction,
} from "../engine/action.ts";
import {
  getInventory,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import {
  drowningPenalty,
  explosiveDamage,
  fallingDamage,
} from "../engine/specialty-combat.ts";

addCmd({
  name: "+fall",
  pattern: /^\+fall\s+(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+fall <meters>  — Falling damage (1 Res / 3m).

Examples:
  +fall 10`,

  exec: async (u: IUrsamuSDK) => {
    const n = Number(
      u.util.stripSubs(u.cmd.args[0] ?? "").trim(),
    );
    if (!Number.isFinite(n) || n < 0) {
      u.send(`${ERR}Usage: ${val("+fall <meters>")}`);
      return;
    }
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const dmg = fallingDamage(n);
    const next = applyResilience(c, -dmg);
    await saveChar(u, next);
    u.send(
      `${OK}Fell ${val(n)}m → ${bad("-" + dmg)} Res` +
        ` (${val(next.resilience)}/${val(next.resilienceMax)})`,
    );
  },
});

addCmd({
  name: "+drown",
  pattern: /^\+drown\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+drown <ds>  — Morphology vs DS; −1 per load item.

Examples:
  +drown 10
  +drown 14`,

  exec: async (u: IUrsamuSDK) => {
    const ds = Number(
      u.util.stripSubs(u.cmd.args[0] ?? "10").trim(),
    ) || 10;
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const { items, load } = await getInventory(u, u.me);
    const pen = drowningPenalty(items.length);
    const gath = gatherBonuses(
      c,
      "morphology",
      -pen,
      pen ? [`load −${pen}`] : [],
      load,
      items,
    );
    const result = resolveAction({
      stat: "morphology",
      statValue: c.stats.morphology,
      bonuses: gath.total,
      ds,
      glitch: 0,
      dangerous: true,
    });
    let sheet = c;
    if (result.damageToSelf > 0) {
      sheet = applyResilience(sheet, -result.damageToSelf);
      await saveChar(u, sheet);
    }
    const ok = result.success ? OK : bad("SINK");
    u.send(
      [
        header("DROWN"),
        `  MOR ${val(c.stats.morphology)}` +
        (gath.total ? ` ${val(gath.total)}` : "") +
        ` → ${val(result.total)} vs DS${val(ds)} ${ok}`,
        gath.parts.length
          ? `  ${gath.parts.join(" · ")}`
          : "",
        result.damageToSelf
          ? `  ${bad("-" + result.damageToSelf)} Res`
          : `  ${OK}surface`,
        footer()
      ].filter(Boolean).join("\r\n"),
    );
  },
});

addCmd({
  name: "+explode",
  pattern: /^\+explode\s+(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+explode <2-4>d6  — Planted charge damage (min N).

Examples:
  +explode 2d6
  +explode 4d6`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    const m = raw.match(/^(\d)\s*d6$/);
    if (!m) {
      u.send(`${ERR}Usage: ${val("+explode 2d6|3d6|4d6")}`);
      return;
    }
    const n = Math.max(2, Math.min(4, Number(m[1])));
    const r = explosiveDamage(n);
    u.send(
      `${OK}Charge ${val(n + "d6")}: ` +
        `[${r.rolls.join("+")}] = ${val(r.total)}` +
        (r.minApplied ? " (min floor)" : "") +
        ` Res to all in blast`,
    );
  },
});

