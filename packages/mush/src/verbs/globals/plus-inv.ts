/**
 * +i / +inv <player> — inspect another player's carried items.
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../../commands/types.ts";
import { divider, footer, header } from "../../format/handlers.ts";

function visibleItems(
  raw: IDBObj[],
  canEdit: boolean,
): IDBObj[] {
  return raw.filter((o: IDBObj) => {
    if (o.flags.has("exit") || o.flags.has("player")) {
      return false;
    }
    if (canEdit) return true;
    return !o.flags.has("dark") && !o.flags.has("opaque");
  });
}

function itemLabel(u: IUrsamuSDK, o: IDBObj): string {
  if (u.util?.displayName) {
    return u.util.displayName(o, u.me);
  }
  return String(
    (o.state?.name as string) || o.name || "(unknown)",
  );
}

export function renderInv(
  u: IUrsamuSDK,
  who: string,
  items: IDBObj[],
): string {
  const width = (u.me.state?.termWidth as number) || 78;
  const lines: string[] = [];
  lines.push(header(`Carried by ${who}`, "=", width));
  if (items.length === 0) {
    lines.push("  Nothing.");
  } else {
    for (const o of items) {
      lines.push(`  ${itemLabel(u, o)}`);
    }
  }
  lines.push(divider("", "-", width));
  const n = items.length;
  lines.push(`  ${n} item${n === 1 ? "" : "s"}.`);
  lines.push(footer("", "=", width));
  return lines.join("\n");
}

function sendInvWeb(
  u: IUrsamuSDK,
  who: string,
  items: IDBObj[],
): void {
  if (!u.ui?.layout) return;
  const list = items.map((o) => ({
    id: o.id,
    label: itemLabel(u, o),
    action: { type: "cmd" as const, cmd: `look #${o.id}` },
  }));
  const n = items.length;
  u.ui.layout({
    components: [
      { type: "header", title: `Carried by ${who}` },
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
          ? "Nothing."
          : `${n} item${n === 1 ? "" : "s"}.`,
      },
    ],
    meta: { type: "inventory" },
  });
}

export async function execPlusInv(u: IUrsamuSDK): Promise<void> {
  const ref = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  if (!ref) {
    u.send("Usage: +i <player>");
    return;
  }

  const target = await u.util.target(u.me, ref, true);
  if (!target) {
    u.send(`No one found matching '${ref}'.`);
    return;
  }
  if (!target.flags.has("player")) {
    u.send(
      `${u.util.displayName(target, u.me)} isn't a player.`,
    );
    return;
  }

  const canEdit = await u.canEdit(u.me, target);
  const sameRoom =
    !!target.location &&
    !!u.here?.id &&
    target.location === u.here.id;
  if (!sameRoom && !canEdit) {
    u.send(
      `${u.util.displayName(target, u.me)} isn't here.`,
    );
    return;
  }

  const raw = await u.db.search({ location: target.id });
  const items = visibleItems(raw, canEdit);
  const who = u.util.displayName(target, u.me);

  if (u.clientType === "web") {
    sendInvWeb(u, who, items);
    return;
  }
  u.send(renderInv(u, who, items));
}

addCmd({
  name: "+i",
  pattern: /^\+(?:i|inv)(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Social",
  help: `+i <player>  — See what another player is carrying.

Same-room for anyone; staff (canEdit) can inspect remotely.
Dark/opaque items are staff-only. Own inventory: inventory

  +inv is an alias for +i.

Telnet uses layout chrome; web play shows an item list.

Examples:
  +i Alice
  +inv Bob`,
  exec: execPlusInv,
});
