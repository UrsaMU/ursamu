// Container access helpers for put / get-from / enter / leave.

import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import { evaluateLock } from "../world/locks.ts";
import { nameMatches as matchName } from "../world/name-match.ts";

/** True when container is in the room or held by the actor. */
export function isNearbyContainer(
  actor: IDBObj,
  container: IDBObj,
): boolean {
  if (container.location === actor.id) return true;
  if (actor.location && container.location === actor.location) {
    return true;
  }
  return container.id === actor.location;
}

/**
 * Shared enter-lock check (no proximity).
 * - @lock/enter when set → must pass (even vs enter_ok).
 * - Else enter_ok, or canEdit (owner/staff).
 * - Else deny (players/things locked by default).
 */
export async function passesEnterLock(
  u: IUrsamuSDK,
  actor: IDBObj,
  target: IDBObj,
): Promise<boolean> {
  if (target.id === actor.id) return false;
  const enterLock =
    (target.state?.locks as Record<string, string> | undefined)?.enter;
  if (enterLock) {
    return evaluateLock(enterLock, actor, target);
  }
  if (target.flags.has("enter_ok")) return true;
  if (await u.canEdit(actor, target)) return true;
  return false;
}

/**
 * May the actor physically enter this object (vehicle, booth, player…)?
 * Rooms use exits; exits are not enterable this way.
 */
export async function canEnterObject(
  u: IUrsamuSDK,
  actor: IDBObj,
  target: IDBObj,
): Promise<boolean> {
  if (target.flags.has("exit")) return false;
  if (target.flags.has("room")) return false;
  if (!isNearbyContainer(actor, target)) return false;
  // Already inside
  if (actor.location === target.id) return false;
  return passesEnterLock(u, actor, target);
}

/**
 * May the actor put into / take from this container?
 * - Own bags (held): always.
 * - Players never inventory-containers (use enter for bodies if unlocked).
 * - @lock/enter when set: must pass.
 * - Else enter_ok, or canEdit (owner/staff).
 */
export async function canAccessContainer(
  u: IUrsamuSDK,
  actor: IDBObj,
  container: IDBObj,
): Promise<boolean> {
  if (container.flags.has("player") || container.flags.has("exit")) {
    return false;
  }
  if (container.flags.has("room")) return false;
  if (!isNearbyContainer(actor, container)) return false;

  if (container.location === actor.id) return true;

  return passesEnterLock(u, actor, container);
}

export function nameMatches(obj: IDBObj, query: string): boolean {
  return matchName(obj, query);
}

/** Find a thing by name among objects whose location is containerId. */
export async function findInContainer(
  u: IUrsamuSDK,
  containerId: string,
  query: string,
): Promise<IDBObj | null> {
  const kids = await u.db.search({ location: containerId });
  const matches = kids.filter(
    (o) =>
      !o.flags.has("player") &&
      !o.flags.has("exit") &&
      !o.flags.has("room") &&
      nameMatches(o, query),
  );
  return matches[0] ?? null;
}

/** Walk parent locations; true if maybeAncestor is on the chain. */
export async function isDescendantOf(
  u: IUrsamuSDK,
  startId: string,
  maybeAncestorId: string,
): Promise<boolean> {
  let cur: string | undefined = startId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === maybeAncestorId) return true;
    seen.add(cur);
    const objs = await u.db.search({ id: cur });
    const obj = objs[0];
    cur = obj?.location;
  }
  return false;
}
