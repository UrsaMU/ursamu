import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  applyRuling,
  layLow,
  recover,
  takeJob,
} from "../src/char.ts";
import { ACTIONS, findAction } from "../src/catalog.ts";
import { rulingLayout } from "../src/layouts.ts";
import { rulingProse } from "../src/prose.ts";
import { resolveRoll } from "../src/roll.ts";
import { emitRoll, formatRollNote } from "../src/emit.ts";
import { sendCard } from "../src/send.ts";
import { dboStore, type IUtopiaStore } from "../src/store.ts";

function listActs(u: IUrsamuSDK): void {
  const names = ACTIONS.map((a) => a.id).join(", ");
  u.send("Actions: " + names);
}

export async function execAct(
  u: IUrsamuSDK,
  store: IUtopiaStore = dboStore,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const buy = sw === "hitch";
  const verb = buy
    ? rest.split(/\s+/)[0] ?? ""
    : (sw || rest.split(/\s+/)[0] || "");
  const extra = buy
    ? rest.replace(/^\S+\s*/, "").trim()
    : (sw ? rest : rest.replace(/^\S+\s*/, "").trim());

  if (!verb) {
    listActs(u);
    return;
  }
  const def = findAction(verb);
  if (!def) {
    u.send("Unknown action. +act for the list.");
    return;
  }

  const loc = String(u.me.location ?? "");
  const name = u.me.name ?? "Someone";
  let ch = await store.loadChar(u.me.id, name, loc);

  if (def.id === "lay-low") {
    const out = layLow(ch);
    if (!out.ok) {
      u.send(out.err);
      return;
    }
    await store.saveChar(out.char);
    emitRoll({
      roomId: loc,
      playerId: u.me.id,
      playerName: name,
      summary: formatRollNote({
        name,
        verb: "lay-low",
        total: 0,
        dv: out.char.lockedDv ?? 0,
        result: "holds",
        dangerFrom: ch.danger,
        dangerTo: out.char.danger,
      }),
    });
    sendCard(u, rulingLayout({
      result: "holds",
      prose: "You drop off the feed. Danger eases.",
      danger: `${ch.danger} → ${out.char.danger}`,
      dv: out.char.lockedDv ?? 0,
    }));
    return;
  }
  if (def.id === "recover") {
    ch = recover(ch);
    await store.saveChar(ch);
    u.send("You bind what you can.");
    return;
  }
  if (def.id === "take-job") {
    const title = extra || "A job from a contact";
    ch = takeJob(ch, title);
    await store.saveChar(ch);
    u.send(`Job taken: ${title}`);
    return;
  }

  const roll = resolveRoll({
    skillDice: 0,
    danger: ch.danger,
    lockedDv: ch.lockedDv,
    buyHitch: buy,
    rng: Math.random,
  });
  const before = ch.danger;
  ch = applyRuling(ch, roll);
  await store.saveChar(ch);
  emitRoll({
    roomId: loc,
    playerId: u.me.id,
    playerName: name,
    summary: formatRollNote({
      name,
      verb: def.id,
      total: roll.total,
      dv: roll.dv,
      result: roll.result,
      dangerFrom: before,
      dangerTo: ch.danger,
    }),
  });
  sendCard(u, rulingLayout({
    result: roll.result,
    prose: rulingProse(roll.result),
    danger: `${before} → ${ch.danger}`,
    dv: roll.dv,
  }));
}

addCmd({
  name: "+act",
  pattern: /^\+act(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Utopia",
  help: `+act[/<switch>] <verb> [<text>]  — Take a week action.

Switches:
  /hitch   Buy success with +1 danger (if danger ≤ 4).

Examples:
  +act gather-information
  +act/hitch hack
  +act take-job Steal the PU`,
  exec: (u) => execAct(u),
});
