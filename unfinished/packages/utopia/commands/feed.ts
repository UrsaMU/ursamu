import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { tickFeed } from "../src/city.ts";
import {
  emitFeedTicked,
  formatFeedNote,
} from "../src/emit.ts";
import { feedLayout } from "../src/layouts.ts";
import { sendCard } from "../src/send.ts";
import { isStaff } from "../src/staff.ts";
import { dboStore, type IUtopiaStore } from "../src/store.ts";

export async function execFeed(
  u: IUrsamuSDK,
  store: IUtopiaStore = dboStore,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  if (sw === "tick") {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }
    const city = await store.loadCity();
    const out = tickFeed(city, Math.random);
    await store.saveCity(out.city);
    const headlines = [
      out.city.tension,
      ...out.city.stories,
    ].map((s) => `${s.title} sev ${s.severity}`);
    emitFeedTicked({
      roomId: String(u.me.location ?? ""),
      playerId: u.me.id,
      playerName: u.me.name ?? "Staff",
      week: out.city.week,
      summary: formatFeedNote({
        city: out.city.name,
        week: out.city.week,
        headlines,
      }),
    });
    if (out.dangerDelta) {
      const loc = String(u.me.location ?? "");
      const ch = await store.loadChar(
        u.me.id,
        u.me.name ?? "Someone",
        loc,
      );
      ch.danger = Math.max(0, ch.danger + out.dangerDelta);
      await store.saveChar(ch);
    }
    sendCard(u, feedLayout(out.city));
    return;
  }
  const city = await store.loadCity();
  sendCard(u, feedLayout(city));
}

addCmd({
  name: "+feed",
  pattern: /^\+feed(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Utopia",
  help: `+feed[/<switch>]  — City newsfeed for this week.

Switches:
  /tick   Staff: advance the week and roll the feed.

Examples:
  +feed        Show the city ticker.
  +feed/tick   Staff advances the week.`,
  exec: (u) => execFeed(u),
});
