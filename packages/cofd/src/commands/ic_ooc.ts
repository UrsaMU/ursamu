/**
 * +ic / +ooc — move between IC play and the OOC Lounge.
 *
 *   +ooc         Save current IC room, go to OOC Lounge (must be approved).
 *   +ic          Return to saved IC room, or the IC hub if none.
 *   +ic/clear    Forget saved IC room and go to the hub.
 *
 * Config (optional):
 *   plugins.cofd.oocRoom   default "1"
 *   plugins.cofd.icHub     default "14"
 *   plugins.cofd.oocRooms  extra rooms never saved as IC bookmarks
 */

import {
  getConfig,
  type IDBObj,
  type IUrsamuSDK,
} from "@ursamu/ursamu";

const DEFAULT_OOC = "1";
const DEFAULT_HUB = "14";
/** Rooms that are never stored as an IC return point. */
const DEFAULT_OOC_ROOMS = ["1", "5", "8", "11"];

function isStaff(actor: IDBObj): boolean {
  const f = actor.flags;
  if (!f) return false;
  return (
    f.has("staff") ||
    f.has("storyteller") ||
    f.has("wizard") ||
    f.has("admin") ||
    f.has("superuser")
  );
}

function isApproved(actor: IDBObj): boolean {
  if (actor.flags?.has("approved")) return true;
  return !!actor.state?.cofd;
}

function oocRoomId(): string {
  return String(
    getConfig<string>("plugins.cofd.oocRoom") ??
      getConfig<string>("game.oocRoom") ??
      DEFAULT_OOC,
  );
}

function icHubId(): string {
  return String(
    getConfig<string>("plugins.cofd.icHub") ??
      getConfig<string>("game.icHub") ??
      DEFAULT_HUB,
  );
}

function oocRoomSet(): Set<string> {
  const extra = getConfig<string[]>("plugins.cofd.oocRooms");
  const base = Array.isArray(extra) && extra.length
    ? extra.map(String)
    : DEFAULT_OOC_ROOMS;
  return new Set([...base, oocRoomId()]);
}

function roomLabel(obj: IDBObj | null | undefined): string {
  if (!obj) return "somewhere";
  const raw = String(
    (obj.state?.name as string | undefined) || obj.name || obj.id,
  );
  return raw.split(";")[0]?.trim() || obj.id;
}

function requireApproved(u: IUrsamuSDK): boolean {
  if (isApproved(u.me) || isStaff(u.me)) return true;
  u.send(
    "You must be %chapproved%cn before going IC. " +
      "Finish %ch+cg%cn and wait for staff.",
  );
  return false;
}

/** Leave/arrive chatter + teleport + look. */
async function moveTo(
  u: IUrsamuSDK,
  destId: string,
  leaveSuffix: string,
  arriveSuffix: string,
): Promise<boolean> {
  const fromId = u.me.location ?? "";
  if (fromId === destId) return false;

  const name = u.util.displayName(u.me, u.me);
  if (fromId && typeof u.here?.broadcast === "function") {
    try {
      u.here.broadcast(`${name} ${leaveSuffix}`, {
        exclude: [u.me.id],
      });
    } catch {
      /* optional */
    }
  }

  await Promise.resolve(u.teleport(u.me.id, destId));
  u.me.location = destId;

  // Fresh look in the destination (new SDK inside execute).
  await Promise.resolve(u.execute("look"));

  // Arrival to others — look already ran; poke the room if we can.
  try {
    const others = await u.db.search({ location: destId });
    for (const o of others) {
      if (o.id === u.me.id) continue;
      if (!o.flags?.has("player") || !o.flags?.has("connected")) {
        continue;
      }
      u.send(`${name} ${arriveSuffix}`, o.id);
    }
  } catch {
    /* best-effort */
  }

  return true;
}

export async function oocExec(u: IUrsamuSDK): Promise<void> {
  if (!requireApproved(u)) return;

  const oocId = oocRoomId();
  const hereId = u.me.location ?? "";

  if (hereId === oocId) {
    u.send("You are already OOC.");
    return;
  }

  // Bookmark IC room unless we are in a known OOC space.
  if (hereId && !oocRoomSet().has(hereId)) {
    await u.db.modify(u.me.id, "$set", {
      "data.icLocation": hereId,
    });
    u.me.state = { ...u.me.state, icLocation: hereId };
  }

  const dest = (await u.db.search({ id: oocId }))[0];
  if (!dest) {
    u.send("OOC Lounge is missing. Contact staff.");
    return;
  }

  const moved = await moveTo(
    u,
    oocId,
    "steps out of character.",
    "arrives out of character.",
  );
  if (!moved) {
    u.send("You are already OOC.");
    return;
  }
  u.send(
    `%chOOC:%cn You are in the ${roomLabel(dest)}. ` +
      (u.me.state?.icLocation
        ? `Your IC marker is set. Use %ch+ic%cn to return.`
        : `No IC marker — %ch+ic%cn will send you to the hub.`),
  );
}

export async function icExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  if (!requireApproved(u)) return;

  const hubId = icHubId();
  const oocId = oocRoomId();

  if (sw === "clear") {
    await u.db.modify(u.me.id, "$unset", { "data.icLocation": "" });
    if (u.me.state) delete u.me.state.icLocation;

    if ((u.me.location ?? "") === hubId) {
      u.send(
        "IC marker cleared. You are already at the IC hub.",
      );
      return;
    }

    const hub = (await u.db.search({ id: hubId }))[0];
    if (!hub) {
      u.send("IC hub is missing. Contact staff.");
      return;
    }

    await moveTo(
      u,
      hubId,
      "vanishes into the city.",
      "steps in from the fog.",
    );
    u.send(
      `%chIC:%cn Marker cleared. You stand at ` +
        `${roomLabel(hub)}.`,
    );
    return;
  }

  if (sw && sw !== "status" && sw !== "where") {
    u.send("Usage: +ic  |  +ic/clear  |  +ic/status");
    return;
  }

  if (sw === "status" || sw === "where") {
    const mark = String(u.me.state?.icLocation ?? "");
    if (!mark) {
      u.send(
        `%chIC:%cn No marker. %ch+ic%cn → hub (#${hubId}).`,
      );
      return;
    }
    const room = (await u.db.search({ id: mark }))[0];
    u.send(
      `%chIC:%cn Marker → ${roomLabel(room)} (#${mark}).`,
    );
    return;
  }

  const mark = String(u.me.state?.icLocation ?? "").trim();
  const destId = mark || hubId;

  if ((u.me.location ?? "") === destId) {
    u.send(
      mark
        ? "You are already at your IC location."
        : "You are already at the IC hub.",
    );
    return;
  }

  // Leaving OOC — no special bookmark change.
  if ((u.me.location ?? "") === oocId) {
    /* fine */
  }

  let dest = (await u.db.search({ id: destId }))[0];
  if (!dest && mark) {
    // Stale marker — fall back to hub.
    await u.db.modify(u.me.id, "$unset", { "data.icLocation": "" });
    if (u.me.state) delete u.me.state.icLocation;
    dest = (await u.db.search({ id: hubId }))[0];
    if (!dest) {
      u.send("IC hub is missing. Contact staff.");
      return;
    }
    u.send("%cyYour IC marker was invalid — sent to the hub.%cn");
  }
  if (!dest) {
    u.send("IC destination is missing. Contact staff.");
    return;
  }

  const finalId = dest.id;
  await moveTo(
    u,
    finalId,
    "slips into character.",
    "arrives in character.",
  );
  u.send(
    `%chIC:%cn You are at ${roomLabel(dest)}.` +
      (mark && mark === finalId
        ? ""
        : " (hub — set a marker by going IC from a scene, then +ooc.)"),
  );
}
