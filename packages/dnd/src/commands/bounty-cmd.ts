/**
 * +bounty — notice-board jobs (kills / delve clear).
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  bountyBySlug,
  listBounties,
  progressLine,
} from "../world/bounties.ts";
import {
  emptyProgress,
  readProgress,
  saveProgress,
  turnInBounty,
} from "../world/bounty-progress.ts";

addCmd({
  name: "+bounty",
  pattern: /^\+bounty(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+bounty — List open bounties.\n` +
    `+bounty/take <slug> — Accept one (replaces active).\n` +
    `+bounty/status — Active progress.\n` +
    `+bounty/turnin — Claim XP/gp/rep when done.\n` +
    `+bounty/board <town> — Filter havenbrook|millhaven.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "take" || sw === "accept") {
      if (!arg) {
        u.send("Usage: +bounty/take <slug>");
        return;
      }
      const def = bountyBySlug(arg);
      if (!def) {
        u.send("Unknown bounty. +bounty for list.");
        return;
      }
      const prog = emptyProgress(def.slug);
      await saveProgress(u, prog);
      u.send(
        `%ch%cyBOUNTY>>%cn Accepted %ch${def.name}%cn. ` +
          `${def.summary}`,
      );
      u.send(
        `  Goal: ${progressLine(def, prog)}. ` +
          `Reward ${def.rewardXp} XP / ${def.rewardGp} gp / ` +
          `rep +${def.rep}.`,
      );
      return;
    }

    if (sw === "status" || sw === "mine") {
      const prog = readProgress(u.me.state);
      if (!prog) {
        u.send("%ch%cyBOUNTY>>%cn No active bounty.");
        return;
      }
      const def = bountyBySlug(prog.slug);
      if (!def) {
        u.send("Broken bounty — +bounty/take another.");
        return;
      }
      u.send(
        `%ch%cyBOUNTY>>%cn ${def.name} — ` +
          progressLine(def, prog),
      );
      return;
    }

    if (sw === "turnin" || sw === "claim" || sw === "complete") {
      const r = await turnInBounty(u);
      u.send(
        r.ok
          ? `%ch%cgBOUNTY>>%cn ${r.message}`
          : `%ch%cyBOUNTY>>%cn ${r.message}`,
      );
      return;
    }

    if (sw === "drop" || sw === "abandon") {
      await saveProgress(u, null);
      u.send("%ch%cyBOUNTY>>%cn Bounty abandoned.");
      return;
    }

    const board = sw === "board" || sw === "list"
      ? arg || undefined
      : sw || undefined;
    const list = listBounties(
      board && board !== "list" ? board : undefined,
    );
    const prog = readProgress(u.me.state);
    u.send("%ch%cyBOUNTY>>%cn Notice board:");
    for (const b of list) {
      const mark = prog?.slug === b.slug ? "*" : " ";
      u.send(
        ` ${mark}${b.slug.padEnd(14)} T${b.tier} ` +
          `${b.board.padEnd(10)} ${b.name}`,
      );
      u.send(
        `   ${b.summary} (${b.rewardXp}xp/${b.rewardGp}gp)`,
      );
    }
    if (prog) {
      const d = bountyBySlug(prog.slug);
      if (d) {
        u.send(
          `Active: ${d.name} — ${progressLine(d, prog)}`,
        );
      }
    }
    u.send("Take: +bounty/take <slug> · Turn in: +bounty/turnin");
  },
});
