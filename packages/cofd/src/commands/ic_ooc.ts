/**
 * +ic / +ooc — move between IC play and the OOC Lounge.
 *
 *   +ooc         If here is an IC room (flag), bookmark it; go OOC Lounge.
 *   +ic          Return to saved IC room, or the IC hub if none.
 *   +ic/clear    Forget saved IC room and go to the hub.
 *
 * Rooms must carry the %chic%cn flag to count as in-character.
 * Builders: @set here=ic
 *
 * Config (optional):
 *   plugins.cofd.oocRoom   default "1"
 *   plugins.cofd.icHub     default "14"
 */

import {
  getConfig,
  type IDBObj,
  type IUrsamuSDK,
} from "@ursamu/ursamu";

const DEFAULT_OOC = "1";
const DEFAULT_HUB = "14";

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

/** Room is IC play space when it has the ic flag. */
function isIcRoom(room: IDBObj | null | undefined): boolean {
  return !!room?.flags?.has("ic");
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

function roomLabel(obj: IDBObj | null | undefined): string {
  if (!obj) return "somewhere";
  const raw = String(
    (obj.state?.name as string | undefined) || obj.name || obj.id,
  );
  return raw.split(";")[0]?.trim() || obj.id;
}

async function loadRoom(
  u: IUrsamuSDK,
  id: string,
): Promise<IDBObj | null> {
  if (!id) return null;
  const hit = await u.db.search({ id });
  return hit[0] ?? null;
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

  await Promise.resolve(u.execute("look"));

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

  // Bookmark only when the current room is flagged IC.
  const hereRoom = await loadRoom(u, hereId);
  let bookmarked = false;
  if (hereId && isIcRoom(hereRoom)) {
    await u.db.modify(u.me.id, "$set", {
      "data.icLocation": hereId,
    });
    u.me.state = { ...u.me.state, icLocation: hereId };
    bookmarked = true;
  }

  const dest = await loadRoom(u, oocId);
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

  const mark = String(u.me.state?.icLocation ?? "");
  let note: string;
  if (bookmarked) {
    note = `IC marker set. Use %ch+ic%cn to return.`;
  } else if (hereId && hereRoom && !isIcRoom(hereRoom)) {
    note = `That room is not IC (no %chic%cn flag) — ` +
      `marker unchanged.`;
  } else if (mark) {
    note = `IC marker unchanged. Use %ch+ic%cn to return.`;
  } else {
    note = `No IC marker — %ch+ic%cn will send you to the hub.`;
  }
  u.send(`%chOOC:%cn You are in the ${roomLabel(dest)}. ${note}`);
}

export async function icExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  if (!requireApproved(u)) return;

  const hubId = icHubId();

  if (sw === "clear") {
    await u.db.modify(u.me.id, "$unset", { "data.icLocation": "" });
    if (u.me.state) delete u.me.state.icLocation;

    if ((u.me.location ?? "") === hubId) {
      u.send(
        "IC marker cleared. You are already at the IC hub.",
      );
      return;
    }

    const hub = await loadRoom(u, hubId);
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
    const room = await loadRoom(u, mark);
    const ok = isIcRoom(room);
    u.send(
      `%chIC:%cn Marker → ${roomLabel(room)} (#${mark})` +
        (ok ? "." : " %cy(not IC — will fall back to hub)%cn."),
    );
    return;
  }

  const mark = String(u.me.state?.icLocation ?? "").trim();
  let destId = mark || hubId;
  let dest = await loadRoom(u, destId);

  // Stale or non-IC marker → hub.
  if (mark && (!dest || !isIcRoom(dest))) {
    await u.db.modify(u.me.id, "$unset", { "data.icLocation": "" });
    if (u.me.state) delete u.me.state.icLocation;
    dest = await loadRoom(u, hubId);
    destId = hubId;
    u.send(
      "%cyYour IC marker was missing or not an IC room " +
        "— sent to the hub.%cn",
    );
  }

  if (!dest) {
    u.send("IC destination is missing. Contact staff.");
    return;
  }

  if ((u.me.location ?? "") === dest.id) {
    u.send(
      mark && mark === dest.id
        ? "You are already at your IC location."
        : "You are already at the IC hub.",
    );
    return;
  }

  const usedMark = mark === dest.id;
  await moveTo(
    u,
    dest.id,
    "slips into character.",
    "arrives in character.",
  );
  u.send(
    `%chIC:%cn You are at ${roomLabel(dest)}.` +
      (usedMark
        ? ""
        : " (hub — %ch+ooc%cn from an %chic%cn room sets your marker.)"),
  );
}
