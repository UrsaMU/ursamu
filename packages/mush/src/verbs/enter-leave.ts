// enter / leave — move into or out of any enterable object (thing/player).
// Same rules as inventory containers: @lock/enter, enter_ok, or ownership.
// Players default locked (no enter_ok) so bodies are not free-entry rooms.

import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import { evaluateLock } from "../world/locks.ts";
import {
  canEnterObject,
  isNearbyContainer,
} from "./container-access.ts";

function display(u: IUrsamuSDK, obj: IDBObj): string {
  return u.util.displayName(obj, u.me);
}

/** Optional CAPACITY / MAPCAPACITY seat cap (0 = none may enter). */
async function capacityOf(
  u: IUrsamuSDK,
  target: IDBObj,
): Promise<number | null> {
  const st = target.state ?? {};
  for (const k of ["capacity", "CAPACITY", "mapCapacity", "MAPCAPACITY"]) {
    const v = st[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim())) {
      return Number(v.trim());
    }
  }
  for (const name of ["CAPACITY", "MAPCAPACITY"]) {
    try {
      const raw = await u.attr.get(target.id, name);
      if (raw != null && /^\d+$/.test(String(raw).trim())) {
        return Number(String(raw).trim());
      }
    } catch {
      /* optional */
    }
  }
  return null;
}

async function passengerCount(
  u: IUrsamuSDK,
  containerId: string,
): Promise<number> {
  const rows = await u.db.search({ location: containerId });
  return rows.filter((o) => o.flags.has("player")).length;
}

/**
 * Move actor into target. Shared by `enter` and map embark aliases.
 * Returns false if a message was already sent.
 */
export async function enterObject(
  u: IUrsamuSDK,
  target: IDBObj,
): Promise<boolean> {
  const actor = u.me;
  if (!(await canEnterObject(u, actor, target))) {
    if (!isNearbyContainer(actor, target)) {
      u.send("I can't find that here.");
      return false;
    }
    if (actor.location === target.id) {
      u.send(`You are already in ${display(u, target)}.`);
      return false;
    }
    u.send("You can't enter that.");
    return false;
  }

  const cap = await capacityOf(u, target);
  if (cap !== null) {
    const n = await passengerCount(u, target.id);
    if (n >= cap) {
      u.send(
        `${display(u, target)} is full (${n}/${cap}).`,
      );
      return false;
    }
  }

  const fromId = actor.location;
  await u.db.modify(actor.id, "$set", { location: target.id });
  // Keep in-memory SDK in sync for follow-on look
  actor.location = target.id;
  u.me.location = target.id;

  const actorName = display(u, actor);
  const tName = display(u, target);

  // ENTER / OENTER (TinyMUX-style)
  const enterMsg = await u.eval(target.id, "ENTER").catch(() => "");
  u.send(enterMsg || `You enter ${tName}.`);

  if (fromId) {
    const oenter = await u.eval(target.id, "OENTER").catch(() => "");
    const roomPeers = await u.db.search({ location: fromId });
    for (const p of roomPeers) {
      if (!p.flags.has("player") || !p.flags.has("connected")) continue;
      if (p.id === actor.id) continue;
      u.send(
        oenter
          ? `${actorName} ${oenter}`
          : `${actorName} enters ${tName}.`,
        p.id,
      );
    }
  }

  try {
    const { execLook } = await import("./look.ts");
    const prevArgs = u.cmd.args;
    u.cmd.args = [`#${target.id}`];
    await execLook(u);
    u.cmd.args = prevArgs;
  } catch {
    /* look optional */
  }
  return true;
}

/**
 * Leave current non-room container. If the container is on the map
 * grid (location map:…), require land first or use lastDock.
 */
export async function leaveObject(u: IUrsamuSDK): Promise<boolean> {
  const actor = u.me;
  const locId = actor.location;
  if (!locId) {
    u.send("You are not inside anything.");
    return false;
  }

  const rows = await u.db.search({ id: locId });
  const container = rows[0];
  if (!container || container.flags.has("room")) {
    u.send("You are not inside anything.");
    return false;
  }
  if (container.flags.has("exit")) {
    u.send("You are not inside anything.");
    return false;
  }

  const leaveLock =
    (container.state?.locks as Record<string, string> | undefined)
      ?.leave;
  if (leaveLock) {
    const ok = await evaluateLock(leaveLock, actor, container);
    if (!ok) {
      u.send("You can't leave.");
      return false;
    }
  }

  const contLoc = container.location || "";
  // Object is currently on the map grid — land first so the vehicle
  // (and any other passengers) stay consistent.
  if (contLoc.startsWith("map:")) {
    u.send(
      "You can't leave while this is on the map. " +
        "Use +map/land first.",
    );
    return false;
  }
  const dest = contLoc;
  if (!dest) {
    u.send("There is nowhere to leave to.");
    return false;
  }

  await u.db.modify(actor.id, "$set", { location: dest });
  actor.location = dest;
  u.me.location = dest;

  const actorName = display(u, actor);
  const cName = display(u, container);
  const oleave = await u.eval(container.id, "OLEAVE").catch(() => "");
  const leaveMsg = await u.eval(container.id, "LEAVE").catch(() => "");
  u.send(leaveMsg || `You leave ${cName}.`);

  const peers = await u.db.search({ location: dest });
  for (const p of peers) {
    if (!p.flags.has("player") || !p.flags.has("connected")) continue;
    if (p.id === actor.id) continue;
    u.send(
      oleave
        ? `${actorName} ${oleave}`
        : `${actorName} arrives from ${cName}.`,
      p.id,
    );
  }

  try {
    const { execLook } = await import("./look.ts");
    const prevArgs = u.cmd.args;
    u.cmd.args = [];
    // Force look at dest room
    u.cmd.args = [`#${dest}`];
    await execLook(u);
    u.cmd.args = prevArgs;
  } catch {
    /* look optional */
  }
  return true;
}

addCmd({
  name: "enter",
  pattern: /^enter\s+(.*)/i,
  lock: "connected",
  category: "Navigation",
  help: `enter <object>  — Go inside an object (vehicle, booth, …).

Uses normal object rules:
  @lock/enter <obj>=…   named enter lock (if set, must pass)
  enter_ok flag          anyone may enter
  owner/staff            always may enter
  default                locked (players stay private)

Optional seat cap: &CAPACITY or &MAPCAPACITY on the object.

Examples:
  enter car
  enter Scout
  @set booth=enter_ok
  @lock/enter vault=flag(wizard)`,
  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!raw) {
      u.send("Enter what?");
      return;
    }
    const target = await u.util.target(u.me, raw, true);
    if (!target) {
      u.send("I can't find that here.");
      return;
    }
    await enterObject(u, target);
  },
});

addCmd({
  name: "leave",
  pattern: /^leave$/i,
  lock: "connected",
  category: "Navigation",
  help: `leave  — Exit the object you are inside.

Uses @lock/leave when set. If the container is on the map
grid (location map:…), land first with +map/land, then leave.

Examples:
  leave
  +map/land · leave`,
  exec: async (u: IUrsamuSDK) => {
    await leaveObject(u);
  },
});
