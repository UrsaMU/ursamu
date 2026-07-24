// +hedge/find — locate Hidden Entry Hollow gates (−2).

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  getSeason,
  hiddenEntryPenalty,
  openHedgeway,
  waysForRoom,
} from "../hedge/index.ts";
import {
  executeRoll,
  parseRollExpression,
} from "../roller/index.ts";
import {
  getSheet,
  loadRoom,
  roomHedge,
} from "./hedge_helpers.ts";
import { resolveWay } from "./hedge_travel.ts";

/**
 * When Hidden Entry is active on the hedge side of a gate,
 * non-owners must find it: Wits+Investigation − 2.
 */
export async function hedgeFind(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const roomId = u.here?.id ?? "";
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  const gateArg = u.util.stripSubs(rest).trim();
  let way = await resolveWay(roomId, gateArg);
  if (!way) {
    const ways = await waysForRoom(roomId);
    if (ways.length === 1) way = ways[0];
    else {
      u.send(
        "Usage: +hedge/find <gate>  " +
          (ways.length
            ? `Gates: ${ways.map((w) => w.name).join(", ")}`
            : "No gates here."),
      );
      return;
    }
  }
  const hedgeRoom = await loadRoom(u, way.hedgeRoomId);
  const hr = roomHedge(hedgeRoom ?? {});
  if (!hr || hr.realm !== "hollow") {
    u.send("That gate does not lead to a Hollow.");
    return;
  }
  const occ = await u.db.search({ location: way.hedgeRoomId });
  const ids = (occ as { id?: string }[])
    .map((o) => o.id ?? "")
    .filter(Boolean);
  const pen = hiddenEntryPenalty(hr, ids);
  if (pen <= 0) {
    u.send(
      "The entrance is not hidden. +hedge/open <gate> normally.",
    );
    return;
  }
  if (hr.hollow?.owners.includes(u.me.id)) {
    u.send("You know your Hollow's door. +hedge/open freely.");
    return;
  }

  const expr = "Wits+Investigation";
  const parsed = parseRollExpression(expr, sheet);
  let pool = parsed.error
    ? (sheet.attributes?.wits ?? 1) +
      (sheet.skills?.investigation ?? 0)
    : parsed.pool;
  pool = Math.max(0, pool - pen);
  const roll = executeRoll(pool);
  const lines = [
    `FIND gate %cy${way.name}%cn — ${expr} −${pen} ` +
      `${pool}d → ${roll.successes}`,
  ];
  if (roll.successes < 1) {
    lines.push("  The entrance stays vanished.");
    u.send(lines.join("\n"));
    return;
  }
  const season = await getSeason();
  const wyrd = sheet.powerStatValue || 1;
  await openHedgeway(way, u.me.id, wyrd, season);
  lines.push(
    "  You find the seam — Hollow gate open briefly.",
  );
  u.send(lines.join("\n"));
}
