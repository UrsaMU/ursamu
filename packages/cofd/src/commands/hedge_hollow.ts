// +hedge Hollow depth: enhance, escape, easy-access.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  addHollowEnhancement,
  findHollowEnhancement,
  freeHollowDots,
  HOLLOW_ENHANCEMENTS,
  hollowHas,
  isHollowOwner,
  removeHollowEnhancement,
} from "../hedge/index.ts";
import { isChangelingSheet } from "../form/index.ts";
import {
  getSheet,
  persistRoomHedge,
  roomHedge,
} from "./hedge_helpers.ts";

export async function hedgeHollow(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const arg = rest.trim().toLowerCase();
  if (!arg || arg === "list") {
    return await hollowList(u);
  }
  if (arg === "status" || arg === "here") {
    return await hollowStatus(u);
  }
  // add / remove enhancement
  const parts = rest.trim().split(/\s+/);
  const op = parts[0]?.toLowerCase() ?? "";
  if (op === "add" || op === "buy") {
    return await hollowAdd(u, parts.slice(1).join(" "));
  }
  if (op === "remove" || op === "del") {
    return await hollowRemove(u, parts.slice(1).join(" "));
  }
  if (op === "escape-to" || op === "escapeto") {
    return await hollowSetEscape(u, parts.slice(1).join(" "));
  }
  // bare slug = add
  return await hollowAdd(u, rest.trim());
}

async function hollowList(u: IUrsamuSDK): Promise<void> {
  const lines = [
    "Hollow enhancements (dots ≤ rating):",
  ];
  for (const e of HOLLOW_ENHANCEMENTS) {
    const cost = e.maxCost
      ? `${e.cost}–${e.maxCost}`
      : String(e.cost);
    lines.push(
      `  %cy${e.slug}%cn (${cost})  ${e.name}`,
    );
    lines.push(`    ${e.description.slice(0, 68)}`);
  }
  lines.push(
    "  +hedge/hollow <slug>   spend free dots",
  );
  lines.push(
    "  +hedge/hollow remove <slug>",
  );
  u.send(lines.join("\n"));
}

async function hollowStatus(u: IUrsamuSDK): Promise<void> {
  const hr = roomHedge(u.here ?? {});
  if (!hr || hr.realm !== "hollow" || !hr.hollow) {
    u.send("This room is not a Hollow.");
    return;
  }
  const free = freeHollowDots(hr);
  const lines = [
    `Hollow rating ${hr.hollow.rating}  ` +
      `free dots ${free}`,
    `  Owners: ${hr.hollow.owners.length}`,
    `  Enhancements: ` +
      (hr.hollow.enhancements.length
        ? hr.hollow.enhancements.join(", ")
        : "(none)"),
  ];
  if (hr.hollow.escapeRoomId) {
    lines.push(
      `  Escape → room ${hr.hollow.escapeRoomId}`,
    );
  }
  u.send(lines.join("\n"));
}

async function hollowAdd(
  u: IUrsamuSDK,
  slug: string,
): Promise<void> {
  if (!slug) {
    u.send("Usage: +hedge/hollow <slug>  or /list");
    return;
  }
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only the Lost enhance Hollows.");
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  let hr = roomHedge(u.here);
  if (!hr || hr.realm !== "hollow") {
    u.send("Stand in a Hollow room.");
    return;
  }
  if (
    !isHollowOwner(hr, u.me.id) &&
    !(await u.canEdit(u.me, u.here!))
  ) {
    u.send("Only Hollow owners (or staff) enhance.");
    return;
  }
  const r = addHollowEnhancement(hr, slug);
  if (!r.ok || !r.room) {
    u.send(r.reason ?? "Cannot add enhancement.");
    return;
  }
  await persistRoomHedge(u, roomId, r.room);
  const def = findHollowEnhancement(
    slug.replace(/-\d+$/, ""),
  );
  u.send(
    `Hollow gains %cy${def?.name ?? slug}%cn. ` +
      `Free dots: ${freeHollowDots(r.room)}.`,
  );
}

async function hollowRemove(
  u: IUrsamuSDK,
  slug: string,
): Promise<void> {
  if (!slug) {
    u.send("Usage: +hedge/hollow remove <slug>");
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  let hr = roomHedge(u.here);
  if (!hr || hr.realm !== "hollow") {
    u.send("Stand in a Hollow room.");
    return;
  }
  if (
    !isHollowOwner(hr, u.me.id) &&
    !(await u.canEdit(u.me, u.here!))
  ) {
    u.send("Only Hollow owners (or staff) remove.");
    return;
  }
  hr = removeHollowEnhancement(hr, slug);
  await persistRoomHedge(u, roomId, hr);
  u.send(`Removed enhancement %cy${slug}%cn.`);
}

async function hollowSetEscape(
  u: IUrsamuSDK,
  roomRef: string,
): Promise<void> {
  if (!roomRef) {
    u.send(
      "Usage: +hedge/hollow escape-to <room name|#id>",
    );
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  let hr = roomHedge(u.here);
  if (!hr?.hollow || hr.realm !== "hollow") {
    u.send("Stand in a Hollow.");
    return;
  }
  if (
    !isHollowOwner(hr, u.me.id) &&
    !(await u.canEdit(u.me, u.here!))
  ) {
    u.send("Permission denied.");
    return;
  }
  if (!hollowHas(hr, "escape-route")) {
    u.send(
      "Need Escape Route enhancement first " +
        "(+hedge/hollow escape-route).",
    );
    return;
  }
  const dest = await u.util.target(u.me, roomRef, true);
  if (!dest) {
    u.send(`No room matches '${roomRef}'.`);
    return;
  }
  hr = {
    ...hr,
    hollow: {
      ...hr.hollow!,
      escapeRoomId: dest.id,
    },
  };
  await persistRoomHedge(u, roomId, hr);
  u.send(
    `Escape Route exits to %cy${dest.name ?? dest.id}%cn.`,
  );
}
