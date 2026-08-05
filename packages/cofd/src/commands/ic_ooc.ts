/**
 * +ic / +ooc — move between IC play and the OOC Lounge.
 *
 *   +ooc         If here is an IC room (flag), bookmark it; go OOC Lounge.
 *   +ic          Return to saved IC room, or the IC hub if none.
 *   +ic/clear    Forget saved IC room (stay put; next +ic → hub).
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
  u.send("%chIC:%cn Need %chapproved%cn first (+cg).");
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
    u.send("%chOOC:%cn Already here.");
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
    u.send("%chOOC:%cn Lounge missing — contact staff.");
    return;
  }

  const moved = await moveTo(
    u,
    oocId,
    "goes OOC.",
    "arrives OOC.",
  );
  if (!moved) {
    u.send("%chOOC:%cn Already here.");
    return;
  }

  let note: string;
  if (bookmarked) {
    note = "Marker set.";
  } else if (hereId && hereRoom && !isIcRoom(hereRoom)) {
    note = "Not IC — marker kept.";
  } else if (String(u.me.state?.icLocation ?? "")) {
    note = "Marker kept.";
  } else {
    note = "No marker.";
  }
  u.send(`%chOOC:%cn ${roomLabel(dest)}. ${note}`);
}

export async function icExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  if (!requireApproved(u)) return;

  const hubId = icHubId();

  if (sw === "clear") {
    // Stay put — only reset the bookmark so next +ic uses the hub.
    const had = String(u.me.state?.icLocation ?? "").trim();
    if (had) {
      await u.db.modify(u.me.id, "$unset", {
        "data.icLocation": "",
      });
      if (u.me.state) delete u.me.state.icLocation;
    }
    u.send(
      had
        ? "%chIC:%cn Marker cleared."
        : "%chIC:%cn No marker.",
    );
    return;
  }

  if (sw && sw !== "status" && sw !== "where") {
    u.send("Usage: +ic | +ic/clear | +ic/status");
    return;
  }

  if (sw === "status" || sw === "where") {
    const mark = String(u.me.state?.icLocation ?? "");
    if (!mark) {
      u.send(`%chIC:%cn No marker → hub (#${hubId}).`);
      return;
    }
    const room = await loadRoom(u, mark);
    const ok = isIcRoom(room);
    u.send(
      `%chIC:%cn ${roomLabel(room)} (#${mark})` +
        (ok ? "." : " %cy(not IC → hub)%cn."),
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
    u.send("%chIC:%cn Bad marker → hub.");
  }

  if (!dest) {
    u.send("%chIC:%cn Destination missing — contact staff.");
    return;
  }

  if ((u.me.location ?? "") === dest.id) {
    u.send(
      mark && mark === dest.id
        ? "%chIC:%cn Already here."
        : "%chIC:%cn Already at hub.",
    );
    return;
  }

  const usedMark = mark === dest.id;
  await moveTo(
    u,
    dest.id,
    "goes IC.",
    "arrives IC.",
  );
  u.send(
    `%chIC:%cn ${roomLabel(dest)}.` +
      (usedMark ? "" : " (hub)"),
  );
}
