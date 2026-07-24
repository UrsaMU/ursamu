// Staff/builder +hedge: create, link, destroy, ways list.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  createHedgeway,
  defaultHedgeRoom,
  destroyHedgeway,
  findHedgewayById,
  findHedgewayByName,
  isHedgeRealm,
  listHedgeways,
} from "../hedge/index.ts";
import {
  isBuilder,
  loadRoom,
  persistRoomHedge,
  wayLine,
} from "./hedge_helpers.ts";

export async function hedgeCreate(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const realmArg = rest.trim().toLowerCase() || "hedge";
  if (!isHedgeRealm(realmArg)) {
    u.send("Usage: +hedge/create [mortal|hedge|hollow]");
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  const hedge = defaultHedgeRoom(realmArg);
  await persistRoomHedge(u, roomId, hedge);
  u.send(
    `Tagged room as %cy${realmArg}%cn Hedge realm ` +
      `(danger=${hedge.danger}).`,
  );
}

export async function hedgeLink(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send(
      "Usage: +hedge/link <name> <mortalRoom>=<hedgeRoom>",
    );
    return;
  }
  const left = rest.slice(0, eq).trim();
  const hedgeId = rest.slice(eq + 1).trim();
  const parts = left.split(/\s+/);
  let name: string;
  let mortalId: string;
  if (parts.length >= 2) {
    name = parts.slice(0, -1).join(" ");
    mortalId = parts[parts.length - 1];
  } else {
    mortalId = parts[0] ?? "";
    name = `way-${mortalId}-${hedgeId}`.slice(0, 48);
  }
  if (!mortalId || !hedgeId) {
    u.send(
      "Usage: +hedge/link <name> <mortalRoom>=<hedgeRoom>",
    );
    return;
  }
  const mRoom = await loadRoom(u, mortalId);
  const hRoom = await loadRoom(u, hedgeId);
  if (!mRoom) {
    u.send(`Mortal room '${mortalId}' not found.`);
    return;
  }
  if (!hRoom) {
    u.send(`Hedge room '${hedgeId}' not found.`);
    return;
  }
  const way = await createHedgeway(
    name,
    mortalId,
    hedgeId,
    u.me.id,
  );
  u.send(
    `Hedgeway %cy${way.name}%cn linked ` +
      `${mortalId} ↔ ${hedgeId} (id ${way.id}).`,
  );
}

export async function hedgeDestroy(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const key = rest.trim();
  if (!key) {
    u.send("Usage: +hedge/destroy <name|id>");
    return;
  }
  let way = await findHedgewayById(key);
  if (!way) way = await findHedgewayByName(key);
  if (!way) {
    u.send(`No hedgeway '${key}'.`);
    return;
  }
  await destroyHedgeway(way.id);
  u.send(`Destroyed hedgeway ${way.name} (${way.id}).`);
}

export async function hedgeWaysList(
  u: IUrsamuSDK,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied. Use +hedge/list here.");
    return;
  }
  const ways = await listHedgeways();
  const lines: string[] = [await divider("H E D G E W A Y S")];
  if (ways.length === 0) {
    lines.push("  None. +hedge/link <name> <mort>=<hedge>");
  } else {
    for (const w of ways) lines.push(wayLine(w, u.me));
  }
  u.send(lines.join("\n"));
}
