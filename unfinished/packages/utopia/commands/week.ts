import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { crewAllReady, setPlan, setReady } from "../src/char.ts";
import {
  emitWeekReady,
  formatWeekNote,
} from "../src/emit.ts";
import { sendCard } from "../src/send.ts";
import { dboStore, type IUtopiaStore } from "../src/store.ts";
import { weekLayout, youLayout } from "../src/layouts.ts";

export async function execWeek(
  u: IUrsamuSDK,
  store: IUtopiaStore = dboStore,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const loc = String(u.me.location ?? "");
  const name = u.me.name ?? "Someone";
  let ch = await store.loadChar(u.me.id, name, loc);
  const city = await store.loadCity();

  if (sw === "plan") {
    if (!rest) {
      u.send("Usage: +week/plan <one sentence>");
      return;
    }
    ch = setPlan(ch, rest, Math.random);
    await store.saveChar(ch);
  } else if (sw === "ready") {
    ch = setReady(ch);
    if (!ch.ready) {
      u.send("Set a plan first: +week/plan <text>");
      return;
    }
    await store.saveChar(ch);
  } else if (sw === "you") {
    sendCard(u, youLayout(ch));
    return;
  }

  await store.saveChar(ch);
  const crew = await store.listCrew(loc);
  if (!crew.some((c) => c.id === ch.id)) crew.push(ch);
  if (crewAllReady(crew)) {
    emitWeekReady({
      roomId: loc,
      week: city.week,
      city: city.name,
      plans: crew.map((c) => ({
        playerId: c.id,
        playerName: c.name,
        plan: c.plan,
      })),
      summary: formatWeekNote({
        city: city.name,
        week: city.week,
        plans: crew.map((c) => ({
          playerName: c.name,
          plan: c.plan,
        })),
      }),
    });
  }
  sendCard(u, weekLayout(city, crew));
}

addCmd({
  name: "+week",
  pattern: /^\+week(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Utopia",
  help: `+week[/<switch>] [<text>]  — This week's plan and crew.

Switches:
  /plan <text>  Set your one-sentence plan (locks DV).
  /ready        Mark ready after you have a plan.
  /you          Your danger, resources, goals.

Examples:
  +week/plan Get the sample.
  +week/ready`,
  exec: (u) => execWeek(u),
});
