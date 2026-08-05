import { gameHooks } from "@ursamu/core";
import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import { divider, footer, header } from "../format/handlers.ts";

export function execHome(u: IUrsamuSDK): void {
  const actor = u.me;
  const homeId = (actor.state.home as string) || "1";
  u.teleport(actor.id, homeId);
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
  const width = (u.me.state?.termWidth as number) || 78;
  const lines: string[] = [];
  lines.push(header(`${who}'s Inventory`, "=", width));
  if (items.length === 0) {
    lines.push("  You are not carrying anything.");
  } else {
    for (const item of items) {
      lines.push(`  ${itemLabel(u, item)}`);
    }
  }
  lines.push(divider("", "-", width));
  const n = items.length;
  lines.push(`  ${n} item${n === 1 ? "" : "s"}.`);
  lines.push(footer("", "=", width));
  return lines.join("\n");
}

function sendInventoryWeb(
  u: IUrsamuSDK,
  items: IDBObj[],
): void {
  if (!u.ui?.layout) return;
  const who = u.util.displayName(u.me, u.me);
  const list = items.map((item) => ({
    id: item.id,
    label: itemLabel(u, item),
    action: { type: "cmd" as const, cmd: `look #${item.id}` },
  }));
  const n = items.length;
  u.ui.layout({
    components: [
      { type: "header", title: `${who}'s Inventory` },
      {
        type: "entity-list",
        title: n === 0
          ? "Empty"
          : (n === 1 ? "1 item" : `${n} items`),
        items: list,
      },
      {
        type: "text",
        content: n === 0
          ? "You are not carrying anything."
          : `${n} item${n === 1 ? "" : "s"}.`,
      },
    ],
    meta: { type: "inventory" },
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
  if (u.clientType === "web") {
    sendInventoryWeb(u, items);
    return;
  }
  u.send(renderInventoryText(u, items));
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
