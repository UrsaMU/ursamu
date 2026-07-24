// +dream road travel / staff road graph.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  addRoadLink,
  findLink,
  parseDreamRoom,
  readDreamState,
  roadStatusLines,
  travelRoad,
  writeDreamState,
} from "../dream/index.ts";
import {
  getSheet,
  isStaff,
  loadRoom,
  moveActor,
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";
import { isInHedge } from "../hedge/index.ts";

export async function dreamTravel(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  const d = readDreamState(sheet);
  if (!d?.active) {
    u.send("Not dreaming. +dream/horn onto the Roads first.");
    return;
  }
  if (!rest) {
    u.send("Usage: +dream/travel <exit label>");
    // Show current node exits if room tagged
    const roomId = d.roadRoomId ?? u.here?.id;
    if (roomId) {
      const room = await loadRoom(u, roomId);
      const dr = parseDreamRoom(room?.state?.dream);
      if (dr) {
        u.send(roadStatusLines(dr).join("\n"));
        return;
      }
    }
    return;
  }
  const roomId = d.roadRoomId ?? u.here?.id;
  if (!roomId) {
    u.send("No Roads node. Staff: +dream/road <name>");
    return;
  }
  const room = await loadRoom(u, roomId);
  const dr = parseDreamRoom(room?.state?.dream);
  if (!dr) {
    u.send(
      "This room is not a Dreaming Roads node. " +
        "Staff +dream/road",
    );
    return;
  }
  const link = findLink(dr, rest);
  if (!link) {
    u.send(
      `No exit '${rest}'. ` +
        `Exits: ${dr.links.map((l) => l.label).join(", ") || "none"}`,
    );
    return;
  }
  const dest = await loadRoom(u, link.to);
  if (!dest) {
    u.send(`Broken link to ${link.to}.`);
    return;
  }
  const destRoad = parseDreamRoom(dest.state?.dream);
  const r = travelRoad(sheet, {
    toRoomId: link.to,
    label: link.label,
    nodeName: destRoad?.name ?? dest.name,
  });
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Cannot travel.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  // Move body when using Horn (physical presence)
  if (d.gate === "horn") {
    await moveActor(u, u.me.id, link.to);
  }
  u.send(r.lines.join("\n"));
}

/** Staff: +dream/road <name> — tag here as Roads node. */
export async function dreamRoadTag(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff only.");
    return;
  }
  if (!u.here?.id) {
    u.send("No room.");
    return;
  }
  const name = rest.trim() || "Dreaming Road";
  const prev = parseDreamRoom(u.here.state?.dream);
  await u.db.modify(u.here.id, "$set", {
    "data.dream": {
      road: true,
      name,
      links: prev?.links ?? [],
      fortification: prev?.fortification,
      bastionOwnerId: prev?.bastionOwnerId,
      bastionName: prev?.bastionName,
      flavor: prev?.flavor,
      createdAt: prev?.createdAt ?? Date.now(),
    },
  });
  u.send(`Tagged Dreaming Roads node: %cy${name}%cn`);
}

/**
 * Staff: +dream/link <label>=<room id|name>
 * Bidirectional optional via /linkboth
 */
export async function dreamRoadLink(
  u: IUrsamuSDK,
  rest: string,
  both: boolean,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff only.");
    return;
  }
  if (!u.here?.id) {
    u.send("No room.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +dream/link <label>=<room id or name>");
    return;
  }
  const label = rest.slice(0, eq).trim();
  const destRef = rest.slice(eq + 1).trim();
  let dest = await loadRoom(u, destRef);
  if (!dest) {
    const rows = await u.db.search({ name: destRef });
    dest = rows[0] ? await loadRoom(u, String(rows[0].id)) : null;
  }
  if (!dest?.id) {
    u.send(`No room matches '${destRef}'.`);
    return;
  }
  const here = await loadRoom(u, u.here.id);
  let dr = parseDreamRoom(here?.state?.dream) ?? {
    road: true as const,
    name: here?.name ?? "Road",
    links: [],
    createdAt: Date.now(),
  };
  dr = addRoadLink(dr, dest.id, label);
  await u.db.modify(u.here.id, "$set", { "data.dream": dr });

  if (both) {
    let dr2 = parseDreamRoom(dest.state?.dream) ?? {
      road: true as const,
      name: dest.name ?? "Road",
      links: [],
      createdAt: Date.now(),
    };
    dr2 = addRoadLink(dr2, u.here.id, label);
    await u.db.modify(dest.id, "$set", { "data.dream": dr2 });
  }
  u.send(
    `Linked %cy${label}%cn → ${dest.name ?? dest.id}` +
      (both ? " (both ways)" : ""),
  );
}

/** Attach current road room to dreamer on Horn success. */
export function hornRoadOpts(
  u: IUrsamuSDK,
  sheet: { hedgeState?: { inHedge?: boolean } },
): {
  inHedge: boolean;
  roadRoomId?: string;
  roadName?: string;
} {
  const hr = roomHedge(u.here ?? {});
  const inHedge = isInHedge(hr) ||
    sheet.hedgeState?.inHedge === true;
  const dr = parseDreamRoom(
    (u.here as { state?: { dream?: unknown } })?.state?.dream,
  );
  if (dr && u.here?.id) {
    return {
      inHedge,
      roadRoomId: u.here.id,
      roadName: dr.name,
    };
  }
  return { inHedge };
}
