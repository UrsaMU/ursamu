import { gameHooks } from "@ursamu/core";
import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import {
  lookAction,
  renderListText,
  sendListLayout,
} from "./cmd-ui.ts";

export async function execHome(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const homeId = String(
    (actor.state.home as string) || "1",
  );
  // teleport → moveObject: leave/arrive + look
  await Promise.resolve(u.teleport(actor.id, homeId));
  u.send("There's no place like home...");
}

function carriedItems(actor: IDBObj): IDBObj[] {
  return ((actor.contents || []) as IDBObj[]).filter(
    (obj) =>
      !obj.flags.has("exit") &&
      !obj.flags.has("room") &&
      !obj.flags.has("player"),
  );
}

function itemLabel(u: IUrsamuSDK, item: IDBObj): string {
  if (u.util?.displayName) {
    return u.util.displayName(item, u.me);
  }
  return String(
    (item.state?.name as string) || item.name || "(unknown)",
  );
}

/** Telnet inventory with game layout chrome. */
export function renderInventoryText(
  u: IUrsamuSDK,
  items: IDBObj[],
): string {
  const who = u.util.displayName(u.me, u.me);
  const n = items.length;
  return renderListText(u, {
    metaType: "inventory",
    title: `${who}'s Inventory`,
    items: items.map((item) => ({
      id: item.id,
      label: itemLabel(u, item),
    })),
    emptyText: "You are not carrying anything.",
    footerText: `${n} item${n === 1 ? "" : "s"}.`,
  });
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

  const items = carriedItems(u.me);
  const who = u.util.displayName(u.me, u.me);
  const n = items.length;
  sendListLayout(u, {
    metaType: "inventory",
    title: `${who}'s Inventory`,
    items: items.map((item) => ({
      id: item.id,
      label: itemLabel(u, item),
      action: lookAction(`#${item.id}`),
    })),
    emptyText: "You are not carrying anything.",
    footerText: `${n} item${n === 1 ? "" : "s"}.`,
  });
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

Telnet uses layout header/divider/footer. Web play shows
an interactive item list (click to look).

Examples:
  inventory
  inv`,
  exec: execInventory,
});
