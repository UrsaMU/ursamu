// Player +hedge travel: open / enter / exit.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  isChangelingSheet,
  isMienActive,
} from "../form/index.ts";
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
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";

export async function resolveWay(
  roomId: string,
  key: string,
): Promise<Hedgeway | null> {
  const ways = await waysForRoom(roomId);
  if (!key) {
    if (ways.length === 1) {
      return await refreshHedgeway(ways[0]);
    }
    return null;
  }
  const k = key.toLowerCase();
  for (const w of ways) {
    const rw = await refreshHedgeway(w);
    if (
      rw.id === key ||
      rw.name.toLowerCase() === k ||
      rw.id.toLowerCase().startsWith(k)
    ) {
      return rw;
    }
  }
  return null;
}

export async function hedgeOpen(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings can portal into the Hedge.");
    return;
  }
  const roomId = u.here?.id ?? u.me.location ?? "";
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  // +hedge/open <gate>[=keyphrase]
  const raw = u.util.stripSubs(rest).trim();
  const eq = raw.indexOf("=");
  const gateArg = (eq >= 0 ? raw.slice(0, eq) : raw).trim();
  const spokenKey = eq >= 0
    ? raw.slice(eq + 1).trim()
    : undefined;
  let way = await resolveWay(roomId, gateArg);
  if (!way) {
    const ways = await waysForRoom(roomId);
    if (ways.length === 0) {
      u.send(
        "No Hedgeway linked to this room. " +
          "Staff: +hedge/link",
      );
      return;
    }
    u.send(
      "Which gate? " +
        ways.map((w) => w.name).join(", ") +
        " — +hedge/open <name>[=key]",
    );
    return;
  }

  const season = await getSeason();
  const fromMortal = way.mortalRoomId === roomId;
  const check = checkPortalEnter(
    sheet,
    way,
    season,
    fromMortal,
    spokenKey,
  );
  if (!check.ok) {
    u.send(check.reason ?? "Cannot open.");
    return;
  }

  // Hidden Entry: when all Hollow owners are inside, hide the gate
  if (fromMortal) {
    const { hiddenEntryActive } = await import(
      "../hedge/hollow_effects.ts"
    );
    const hedgeRoom = await loadRoom(u, way.hedgeRoomId);
    const hr = roomHedge(hedgeRoom ?? {});
    if (hr?.realm === "hollow" && hr.hollow) {
      const occ = await u.db.search({
        location: way.hedgeRoomId,
      });
      const ids = (occ as { id?: string }[])
        .map((o) => o.id ?? "")
        .filter(Boolean);
      if (
        hiddenEntryActive(hr, ids) &&
        !hr.hollow.owners.includes(u.me.id)
      ) {
        u.send(
          "The Hollow entrance has vanished (Hidden Entry). " +
            "+hedge/find <gate> (Wits+Investigation −2).",
        );
        return;
      }
    }
  }

  let nextSheet = sheet;
  if (check.needsOpen && check.glamourCost > 0) {
    nextSheet = spendGlamour(sheet, check.glamourCost);
  }
  if (check.needsOpen || way.state !== "open") {
    const wyrd = Math.max(1, sheet.powerStatValue ?? 1);
    way = await openHedgeway(way, u.me.id, wyrd, season);
  }

  const dest = otherSideRoom(way, roomId);
  if (!dest) {
    u.send("Broken hedgeway link.");
    return;
  }
  const destRoom = await loadRoom(u, dest);
  if (!destRoom) {
    u.send(`Destination room ${dest} missing.`);
    return;
  }

  const hs = readHedgeState(nextSheet);
  const prior = isMienActive(nextSheet) ? "mien" as const : "mask";
  // fromMortal → dest is Hedge (inHedge true); reverse clears it.
  nextSheet = writeHedgeState(nextSheet, {
    ...hs,
    lastHedgewayId: way.id,
    priorMaskOnEnter: fromMortal ? prior : hs.priorMaskOnEnter,
    inHedge: fromMortal ? true : false,
  });
  let rotNote = "";
  if (!fromMortal) {
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

  const g = nextSheet.energyCurrent ?? 0;
  const costNote = check.glamourCost > 0
    ? ` Glamour -${check.glamourCost} (now ${g}).`
    : "";
  const destName = destRoom.name ?? dest;
  u.send(
    `The portal peels open. You step through into ` +
      `%cy${destName}%cn.${costNote}${rotNote}`,
  );
  u.broadcast?.(
    `%ch${u.util.displayName(u.me, u.me)}%cn steps through ` +
      `a Hedge gateway.`,
  );
}

export async function hedgeEnter(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  return await hedgeOpen(u, rest);
}
