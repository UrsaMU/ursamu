/** +roll +score — Action rolls and compact stat line. */
import { addCmd, gameHooks } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  footer,
  ARR,
  ERR,
  header,
  divider,
  val,
  ylw,
} from "./chrome.ts";
import { STAT_KEYS } from "../db/schemas.ts";
import {
  effectiveLoadoutMax,
  gatherBonuses,
  resolveAction,
} from "../engine/action.ts";
import { woundGlitch } from "../engine/damage.ts";
import {
  getChar,
  getInventory,
  requireChar,
} from "../engine/sheet-io.ts";
import {
  parseDs,
  parseMods,
  parseStat,
  renderResult,
} from "./attack-shared.ts";
import {
  buildRollPayload,
  buildSheetPayload,
  emitSprawl,
  sheetGear,
} from "./frame.ts";

addCmd({
  name: "+roll",
  pattern: /^\+roll\s+(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+roll <stat>[/<ds>] [+glitch|+upgrade|+N|+bg]
  — 2d6 Action Roll vs Difficulty Score.

Stats: morphology equilibrium reaction cognition affinity
  (mor equ rea cog aff)

Examples:
  +roll reaction/12
  +roll cognition/hard +upgrade
  +roll affinity/10 +bg +1`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!raw) {
      u.send(
        `${ERR}Usage: ${val("+roll <stat>[/<ds>] [mods]")}`,
      );
      return;
    }
    const c = requireChar(u);
    if (!c) {
      u.send(
        `${ARR}No sheet. Type ${val("+chargen")} to start.`,
      );
      return;
    }

    const [head, ...restParts] = raw.split(/\s+/);
    const [statRaw, dsRaw] = head.split("/");
    const stat = parseStat(statRaw);
    if (!stat) {
      u.send(
        `${ERR}Unknown stat. Use: ${STAT_KEYS.join(" ")}`,
      );
      return;
    }
    const ds = dsRaw ? parseDs(dsRaw) : 10;
    if (ds === null) {
      u.send(`${ERR}Bad DS. Number or easy/moderate/hard…`);
      return;
    }
    const mods = parseMods(restParts.join(" "));
    const bgN = mods.bg && c.background ? 1 : 0;
    const { items, load } = await getInventory(u, u.me);
    const gath = gatherBonuses(
      c,
      stat,
      mods.bonus + bgN,
      [
        ...(mods.bonus ? [`extra +${mods.bonus}`] : []),
        ...(bgN ? ["background +1"] : []),
      ],
      load,
      items,
    );
    const glitch = mods.glitch + woundGlitch(c);
    const result = resolveAction({
      stat,
      statValue: c.stats[stat],
      bonuses: gath.total,
      ds,
      glitch,
      upgrade: mods.upgrade,
      dangerous: false,
    });
    const text = renderResult("ACTION ROLL", result, gath.parts);
    emitSprawl(
      u,
      "roll",
      buildRollPayload(result, { parts: gath.parts }),
      text,
    );
    // deno-lint-ignore no-explicit-any
    (gameHooks as any).emit?.("sprawl:roll", {
      actorId: u.me.id,
      ...result,
    });
  },
});


addCmd({
  name: "+score",
  pattern: /^\+score\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+score [<player>]  — Compact stat line.

Examples:
  +score
  +score Alice`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    let target = u.me;
    if (arg) {
      const found = await u.util.target(u.me, arg, true);
      if (!found) {
        u.send(`${ERR}Not found.`);
        return;
      }
      target = found;
    }
    const c = getChar(target);
    if (!c?.chargenComplete) {
      u.send(`${ARR}No approved sheet.`);
      return;
    }
    const { items, load } = await getInventory(u, target);
    const max = effectiveLoadoutMax(c.loadoutMax, items);
    const n = u.util.displayName(target, u.me);
    const s = c.stats;
    const text = [
      header("SCORE"),
      `  ${ylw(n)}` +
      (c.backgroundName
        ? ` :: ${c.backgroundName}`
        : ""),
      `  ` +
      `MOR ${val(s.morphology)}  ` +
      `EQU ${val(s.equilibrium)}  ` +
      `REA ${val(s.reaction)}  ` +
      `COG ${val(s.cognition)}  ` +
      `AFF ${val(s.affinity)}`,
      `  Res ${val(c.resilience)}/${val(c.resilienceMax)}` +
      `  Load ${val(load)}/${val(max)}` +
      `  b¥ ${val(c.bityuan)}`,
      footer()
    ].join("\r\n");
    emitSprawl(
      u,
      "sheet",
      buildSheetPayload(c, {
        name: n,
        load,
        loadMax: max,
        gear: sheetGear(items),
      }),
      text,
    );
  },
});
