// +hedge/escape and Easy Access (/access).

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  hollowHas,
  isHollowOwner,
  spendGlamour,
  writeHedgeState,
  readHedgeState,
  isInHedge,
} from "../hedge/index.ts";
import { isChangelingSheet } from "../form/index.ts";
import {
  getSheet,
  loadRoom,
  moveActor,
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";

/** +hedge/escape — leave via Escape Route. */
export async function hedgeEscape(
  u: IUrsamuSDK,
  _rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const hr = roomHedge(u.here ?? {});
  if (!hr || hr.realm !== "hollow") {
    u.send("Escape Route only works inside a Hollow.");
    return;
  }
  if (!hollowHas(hr, "escape-route")) {
    u.send("This Hollow has no Escape Route.");
    return;
  }
  if (
    !isHollowOwner(hr, u.me.id) &&
    !(await u.canEdit(u.me, u.here!))
  ) {
    // Book: owners + permitted only — owners only for v1
    u.send("Only Hollow owners may use Escape Route.");
    return;
  }
  const destId = hr.hollow?.escapeRoomId;
  if (!destId) {
    u.send(
      "No escape destination. " +
        "+hedge/hollow escape-to <room>",
    );
    return;
  }
  const dest = await loadRoom(u, destId);
  if (!dest) {
    u.send(`Escape room ${destId} missing.`);
    return;
  }
  const hs = readHedgeState(sheet);
  await persistSheet(
    u,
    u.me.id,
    writeHedgeState(sheet, {
      ...hs,
      inHedge: false,
    }),
  );
  await moveActor(u, u.me.id, destId);
  u.send(
    `You slip the Escape Route into ` +
      `%cy${dest.name ?? destId}%cn.`,
  );
}

/**
 * +hedge/access — Easy Access: 1 Glamour from mortal
 * into home Hollow (any unlocked door fictionally).
 */
export async function hedgeAccess(
  u: IUrsamuSDK,
  _rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only the Lost use Easy Access.");
    return;
  }
  const hrHere = roomHedge(u.here ?? {});
  if (isInHedge(hrHere)) {
    u.send(
      "Easy Access is from the mortal world into your Hollow.",
    );
    return;
  }
  const hollowId = sheet.hedgeState?.homeHollowId;
  if (!hollowId) {
    u.send(
      "No home Hollow. Claim one: +hedge/claim",
    );
    return;
  }
  const hollowRoom = await loadRoom(u, hollowId);
  if (!hollowRoom) {
    u.send("Home Hollow room is missing.");
    return;
  }
  const hr = roomHedge(hollowRoom);
  if (!hr || hr.realm !== "hollow") {
    u.send("Home Hollow is not tagged hollow.");
    return;
  }
  if (!hollowHas(hr, "easy-access")) {
    u.send(
      "Your Hollow needs Easy Access " +
        "(+hedge/hollow easy-access, 3 dots).",
    );
    return;
  }
  if (!isHollowOwner(hr, u.me.id)) {
    u.send("You do not own that Hollow.");
    return;
  }
  if ((sheet.energyCurrent ?? 0) < 1) {
    u.send("Need 1 Glamour for Easy Access.");
    return;
  }
  let next = spendGlamour(sheet, 1);
  const hs = readHedgeState(next);
  next = writeHedgeState(next, {
    ...hs,
    inHedge: true,
    homeHollowId: hollowId,
  });
  await persistSheet(u, u.me.id, next);
  await moveActor(u, u.me.id, hollowId);
  u.send(
    `You knock thrice and step into your Hollow ` +
      `(%cy${hollowRoom.name ?? hollowId}%cn). ` +
      `Glamour -1.`,
  );
}
