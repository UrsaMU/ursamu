// Player +hedge/exit and /claim.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { isChangelingSheet } from "../form/index.ts";
import {
  checkPortalEnter,
  enforceFruitObjectCap,
  getSeason,
  openHedgeway,
  otherSideRoom,
  readHedgeState,
  refreshHedgeway,
  spendGlamour,
  waysForRoom,
  writeHedgeState,
  type Hedgeway,
} from "../hedge/index.ts";
import {
  getSheet,
  loadRoom,
  moveActor,
  persistRoomHedge,
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";
import { resolveWay } from "./hedge_travel.ts";

export async function hedgeExit(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const roomId = u.here?.id ?? u.me.location ?? "";
  const hr = roomHedge(u.here ?? { state: {} });
  const ways = await waysForRoom(roomId);
  if (
    ways.length === 0 &&
    hr?.realm !== "hedge" &&
    hr?.realm !== "hollow"
  ) {
    u.send("No Hedge exit from here.");
    return;
  }

  // +hedge/exit [<gate>][=keyphrase]
  const raw = u.util.stripSubs(rest).trim();
  const eq = raw.indexOf("=");
  const gateArg = (eq >= 0 ? raw.slice(0, eq) : raw).trim();
  const spokenKey = eq >= 0
    ? raw.slice(eq + 1).trim()
    : undefined;
  let way: Hedgeway | null = null;
  if (gateArg) {
    way = await resolveWay(roomId, gateArg);
  } else {
    const hs = readHedgeState(sheet);
    if (hs.lastHedgewayId) {
      const match = ways.find(
        (w) => w.id === hs.lastHedgewayId,
      );
      if (match) way = await refreshHedgeway(match);
    }
    if (!way && ways.length === 1) {
      way = await refreshHedgeway(ways[0]);
    }
  }
  if (!way) {
    if (ways.length === 0) {
      u.send("No hedgeway linked from this room.");
      return;
    }
    u.send(
      "Which exit? " + ways.map((w) => w.name).join(", "),
    );
    return;
  }

  const dest = otherSideRoom(way, roomId);
  if (!dest) {
    u.send("Broken hedgeway link.");
    return;
  }

  const season = await getSeason();
  const fromMortal = way.mortalRoomId === roomId;
  const check = checkPortalEnter(
    isChangelingSheet(sheet) ? sheet : null,
    way,
    season,
    fromMortal,
    spokenKey,
  );
  if (!check.ok) {
    u.send(check.reason ?? "Cannot exit.");
    return;
  }

  let nextSheet = sheet;
  if (check.needsOpen && check.glamourCost > 0) {
    nextSheet = spendGlamour(sheet, check.glamourCost);
  }
  if (
    (check.needsOpen || way.state !== "open") &&
    isChangelingSheet(sheet)
  ) {
    const wyrd = Math.max(1, sheet.powerStatValue ?? 1);
    way = await openHedgeway(way, u.me.id, wyrd, season);
  }

  const hs = readHedgeState(nextSheet);
  // Leaving toward mortal side clears inHedge.
  const destIsMortal = way.hedgeRoomId === roomId;
  nextSheet = writeHedgeState(nextSheet, {
    ...hs,
    lastHedgewayId: way.id,
    inHedge: destIsMortal ? false : true,
  });
  let rotNote = "";
  if (destIsMortal) {
    const rotted = await enforceFruitObjectCap(
      u,
      u.me.id,
      nextSheet.powerStatValue ?? 0,
      false,
    );
    if (rotted > 0) {
      rotNote =
        ` ${rotted} goblin fruit rotted (carry cap).`;
    }
  }
  await persistSheet(u, u.me.id, nextSheet);
  await moveActor(u, u.me.id, dest);

  const destRoom = await loadRoom(u, dest);
  const destName = destRoom?.name ?? dest;
  const costNote = check.glamourCost > 0
    ? ` Glamour -${check.glamourCost}.`
    : "";
  u.send(
    `You push back through the thorns into ` +
      `%cy${destName}%cn.${costNote}${rotNote}`,
  );
}

export async function hedgeClaim(
  u: IUrsamuSDK,
  _rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings claim Hollows.");
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  let hr = roomHedge(u.here);
  if (!hr || hr.realm !== "hollow") {
    u.send(
      "This room is not a Hollow. " +
        "Staff: +hedge/create hollow",
    );
    return;
  }
  const owners = [...(hr.hollow?.owners ?? [])];
  if (owners.includes(u.me.id)) {
    u.send("You already claim this Hollow.");
    return;
  }
  if (owners.length > 0) {
    const room = await loadRoom(u, roomId);
    if (room && !(await u.canEdit(u.me, room))) {
      u.send(
        "Hollow already claimed. " +
          "Owner or staff must add you.",
      );
      return;
    }
  }
  owners.push(u.me.id);
  hr = {
    ...hr,
    hollow: {
      owners,
      rating: hr.hollow?.rating ?? 1,
      enhancements: hr.hollow?.enhancements ?? [],
      escapeRoomId: hr.hollow?.escapeRoomId,
    },
  };
  await persistRoomHedge(u, roomId, hr);

  // Remember home Hollow on sheet.
  const hs = readHedgeState(sheet);
  await persistSheet(
    u,
    u.me.id,
    writeHedgeState(sheet, {
      ...hs,
      homeHollowId: roomId,
    }),
  );

  u.send(
    `You claim this Hollow (owners: ${owners.length}, ` +
      `rating ${hr.hollow?.rating ?? 1}). ` +
      `Enhance: +hedge/hollow <slug>`,
  );
}
