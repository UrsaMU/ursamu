// Staff switches for +icon.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  addIcon,
  findIcon,
  ICON_KINDS,
  readIcons,
  recoverIcon,
  setIconStatus,
  type IconKind,
} from "../icon/index.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
} from "./market_helpers.ts";

export async function iconGrant(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send(
      "Usage: +icon/grant <player>=" +
        "name[/kind[/heldBy]] [description]",
    );
    return;
  }
  const who = rest.slice(0, eq).trim();
  const rhs = rest.slice(eq + 1).trim();
  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }
  const sheet = getSheet(target);
  if (!sheet) {
    u.send("Target has no sheet.");
    return;
  }
  const space = rhs.search(/\s/);
  const head = space >= 0 ? rhs.slice(0, space) : rhs;
  const desc = space >= 0 ? rhs.slice(space + 1).trim() : "";
  const parts = head.split("/").map((p) => p.trim());
  const name = parts[0] ?? "";
  if (!name) {
    u.send("Icon needs a name.");
    return;
  }
  let kind: IconKind = "other";
  if (parts[1]) {
    const k = parts[1].toLowerCase();
    if ((ICON_KINDS as readonly string[]).includes(k)) {
      kind = k as IconKind;
    }
  }
  const heldBy = parts[2] || "Unknown";
  const r = addIcon(sheet, {
    name,
    kind,
    heldBy,
    description: desc,
    status: "lost",
  });
  await persistSheet(u, target.id, r.sheet);
  u.send(
    `Granted Icon %cy${r.icon.name}%cn ` +
      `(${r.icon.id.slice(-8)}) to ${target.name}.`,
  );
  u.send(
    `Icon granted: ${r.icon.name} ` +
      `[${r.icon.kind}] held by ${r.icon.heldBy}.`,
    target.id,
  );
}

export async function iconRecover(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const parts = rest.trim().split(/\s+/);
  if (parts.length < 2) {
    u.send("Usage: +icon/recover <player> <id|name>");
    return;
  }
  const who = parts[0];
  const id = parts.slice(1).join(" ");
  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }
  const sheet = getSheet(target);
  if (!sheet) {
    u.send("Target has no sheet.");
    return;
  }
  const r = recoverIcon(sheet, id);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Cannot recover.");
    return;
  }
  await persistSheet(u, target.id, r.sheet);
  u.send(r.lines.join("\n"));
  u.send(r.lines.join("\n"), target.id);
}

export async function iconHold(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +icon/hold <player> <id>=<holder>");
    return;
  }
  const left = rest.slice(0, eq).trim();
  const holder = rest.slice(eq + 1).trim();
  const bits = left.split(/\s+/);
  if (bits.length < 2 || !holder) {
    u.send("Usage: +icon/hold <player> <id>=<holder>");
    return;
  }
  const who = bits[0];
  const id = bits.slice(1).join(" ");
  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }
  const sheet = getSheet(target);
  if (!sheet) {
    u.send("Target has no sheet.");
    return;
  }
  const icon = findIcon(sheet, id);
  if (!icon) {
    u.send(`No Icon matches '${id}'.`);
    return;
  }
  const r = setIconStatus(sheet, icon.id, "held", {
    heldBy: holder.slice(0, 80),
  });
  await persistSheet(u, target.id, r.sheet!);
  u.send(
    `Icon %cy${icon.name}%cn now held by ${holder}.`,
  );
}

export async function iconRemove(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const parts = rest.trim().split(/\s+/);
  if (parts.length < 2) {
    u.send("Usage: +icon/remove <player> <id|name>");
    return;
  }
  const who = parts[0];
  const id = parts.slice(1).join(" ");
  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }
  const sheet = getSheet(target);
  if (!sheet) {
    u.send("Target has no sheet.");
    return;
  }
  const icons = readIcons(sheet);
  const icon = findIcon(sheet, id);
  if (!icon) {
    u.send(`No Icon matches '${id}'.`);
    return;
  }
  const next = icons.filter((i) => i.id !== icon.id);
  await persistSheet(u, target.id, {
    ...sheet,
    icons: next,
  });
  u.send(`Removed Icon %cy${icon.name}%cn.`);
}
