/**
 * +i / +inv <player> — inspect another player's carried items.
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../../commands/types.ts";
import {
  lookAction,
  renderListText,
  sendListLayout,
} from "../cmd-ui.ts";

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
  const n = items.length;
  return renderListText(u, {
    metaType: "inventory",
    title: `Carried by ${who}`,
    items: items.map((o) => ({
      id: o.id,
      label: itemLabel(u, o),
    })),
    emptyText: "Nothing.",
    footerText: `${n} item${n === 1 ? "" : "s"}.`,
  });
}

export async function execPlusInv(u: IUrsamuSDK): Promise<void> {
  const ref = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  // Bare +inv / +i → own inventory (same as `inventory`)
  if (!ref) {
    const { execInventory } = await import("../home.ts");
    await execInventory(u);
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
  const n = items.length;

  sendListLayout(u, {
    metaType: "inventory",
    title: `Carried by ${who}`,
    items: items.map((o) => ({
      id: o.id,
      label: itemLabel(u, o),
      action: lookAction(`#${o.id}`),
    })),
    emptyText: "Nothing.",
    footerText: `${n} item${n === 1 ? "" : "s"}.`,
  });
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
