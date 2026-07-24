// +icon — Icons (lost pieces of self, CtL).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  activeIcons,
  findIcon,
  readIcons,
  spendIcon,
} from "../icon/index.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
  requireChangeling,
} from "./market_helpers.ts";
import {
  iconGrant,
  iconHold,
  iconRecover,
  iconRemove,
} from "./icon_staff.ts";

export async function iconCommand(
  u: IUrsamuSDK,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  switch (sw) {
    case "":
    case "list":
    case "status":
      return await iconList(u, rest);
    case "info":
    case "show":
      return await iconInfo(u, rest);
    case "spend":
      return await iconSpend(u, rest);
    case "grant":
    case "add":
      return await iconGrant(u, rest);
    case "recover":
      return await iconRecover(u, rest);
    case "hold":
      return await iconHold(u, rest);
    case "remove":
    case "del":
      return await iconRemove(u, rest);
    default:
      u.send(`Unknown +icon switch: /${sw}`);
  }
}

async function iconList(
  u: IUrsamuSDK,
  who: string,
): Promise<void> {
  let target = u.me;
  if (who && isStaff(u.me)) {
    const t = await u.util.target(u.me, who, true);
    if (!t) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    target = t;
  }
  const sheet = getSheet(target);
  const err = requireChangeling(sheet, "Icons");
  if (err && target.id === u.me.id) {
    u.send(err);
    return;
  }
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  const icons = readIcons(sheet);
  const active = activeIcons(sheet);
  const lines = [
    await divider("I C O N S"),
    `  Active: ${active.length}  ` +
      `(total ${icons.length})`,
  ];
  if (icons.length === 0) {
    lines.push("  (none)");
  } else {
    for (const i of icons) {
      const st = i.status === "held"
        ? "%cyheld%cn"
        : i.status === "lost"
        ? "%crlost%cn"
        : i.status === "spent"
        ? "spent"
        : "%cgrecovered%cn";
      lines.push(
        `  %cy${i.id.slice(-8)}%cn  ${i.name}  ` +
          `[${i.kind}] ${st}`,
      );
      lines.push(
        `    held by ${i.heldBy}` +
          (i.description
            ? ` — ${i.description.slice(0, 40)}`
            : ""),
      );
    }
  }
  lines.push("  +icon/spend <id|name> [=note]");
  lines.push("  Staff: +icon/grant <p>=name/kind/heldBy");
  u.send(lines.join("\n"));
}

async function iconInfo(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  const err = requireChangeling(sheet, "Icons");
  if (err) {
    u.send(err);
    return;
  }
  if (!arg) {
    u.send("Usage: +icon/info <id|name>");
    return;
  }
  const icon = findIcon(sheet!, arg);
  if (!icon) {
    u.send(`No Icon matches '${arg}'.`);
    return;
  }
  u.send(
    [
      await divider(icon.name.toUpperCase()),
      `  Id: ${icon.id}`,
      `  Kind: ${icon.kind}  Status: ${icon.status}`,
      `  Held by: ${icon.heldBy}`,
      icon.description
        ? `  ${icon.description}`
        : "  (no description)",
      icon.spentNote
        ? `  Spent note: ${icon.spentNote}`
        : "",
    ].filter(Boolean).join("\n"),
  );
}

async function iconSpend(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  const err = requireChangeling(sheet, "Icons");
  if (err) {
    u.send(err);
    return;
  }
  const eq = rest.indexOf("=");
  const id = (eq >= 0 ? rest.slice(0, eq) : rest).trim();
  const note = eq >= 0 ? rest.slice(eq + 1).trim() : "";
  if (!id) {
    u.send("Usage: +icon/spend <id|name> [=note]");
    return;
  }
  const r = spendIcon(sheet!, id, note);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Cannot spend Icon.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  u.send(r.lines.join("\n"));
}
