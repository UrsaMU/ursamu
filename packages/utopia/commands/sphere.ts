import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { sphereLayout } from "../src/layouts.ts";
import { sendCard } from "../src/send.ts";
import { dboStore, type IUtopiaStore } from "../src/store.ts";

export async function execSphere(
  u: IUrsamuSDK,
  store: IUtopiaStore = dboStore,
): Promise<void> {
  const loc = String(u.me.location ?? "");
  const name = u.me.name ?? "Someone";
  const ch = await store.loadChar(u.me.id, name, loc);
  const npcs = await store.listSphere(u.me.id);
  sendCard(u, sphereLayout(ch, npcs));
}

addCmd({
  name: "+sphere",
  pattern: /^\+sphere(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Utopia",
  help: `+sphere  — People, bills, and reputation.

Examples:
  +sphere
  +sphere Ms Mao`,
  exec: (u) => execSphere(u),
});
