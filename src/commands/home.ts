import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK, IDBObj } from "../@types/UrsamuSDK.ts";

export function execHome(u: IUrsamuSDK): void {
  const actor = u.me;
  const homeId = (actor.state.home as string) || "1";
  u.teleport(actor.id, homeId);
  u.send("There's no place like home...");
}

export function execInventory(u: IUrsamuSDK): void {
  const actor = u.me;
  const items = (actor.contents || []).filter(
    (obj) => !(obj as IDBObj).flags.has("exit") && !(obj as IDBObj).flags.has("room") && !(obj as IDBObj).flags.has("player")
  ) as IDBObj[];

  let telnet = `%ch${u.util.displayName(actor, actor)}'s Inventory%cn\n`;
  if (items.length === 0) {
    telnet += "You are not carrying anything.\n";
  } else {
    for (const item of items) telnet += `  ${u.util.displayName(item, actor)}\n`;
  }
  u.send(telnet);
}

addCmd({
  name: "home",
  pattern: /^home$/i,
  lock: "connected",
  category: "Navigation",
  help: `home  — Go to your home location.

Examples:
  home`,
  exec: execHome,
});

addCmd({
  name: "inventory",
  pattern: /^(?:inventory|inv|i)$/i,
  lock: "connected",
  category: "Information",
  help: `inventory  — List what you are carrying.

Aliases: inv, i

Examples:
  inventory
  inv`,
  exec: execInventory,
});
