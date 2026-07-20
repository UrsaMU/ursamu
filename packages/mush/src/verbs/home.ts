import { gameHooks } from "@ursamu/core";
import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";

export function execHome(u: IUrsamuSDK): void {
  const actor = u.me;
  const homeId = (actor.state.home as string) || "1";
  u.teleport(actor.id, homeId);
  u.send("There's no place like home...");
}

/**
 * Plugins may handle inventory via the soft hook `inventory:show`.
 * Set ctx.handled = true to skip the stock contents listing.
 */
export async function execInventory(u: IUrsamuSDK): Promise<void> {
  const ctx = { u, handled: false };
  // deno-lint-ignore no-explicit-any
  await (gameHooks as any).emit("inventory:show", ctx);
  if (ctx.handled) return;

  const actor = u.me;
  const items = (actor.contents || []).filter(
    (obj) =>
      !(obj as IDBObj).flags.has("exit") &&
      !(obj as IDBObj).flags.has("room") &&
      !(obj as IDBObj).flags.has("player"),
  ) as IDBObj[];

  let output =
    `%ch${u.util.displayName(actor, actor)}'s Inventory%cn\n`;
  if (items.length === 0) {
    output += "You are not carrying anything.\n";
  } else {
    for (const item of items) {
      output += `  ${u.util.displayName(item, actor)}\n`;
    }
  }
  u.send(output);
}

addCmd({
  name: "home",
  pattern: /^home$/i,
  lock: "connected",
  category: "Navigation",
  help: `home  — Go to your home location.

Use \`@link me=<room>\` to change where home sends you.

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
