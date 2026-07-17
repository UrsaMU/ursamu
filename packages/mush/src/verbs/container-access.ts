// Container access helpers for put / get-from.

import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import { evaluateLock } from "../world/locks.ts";

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
 * May the actor put into / take from this container?
 * - Own bags (held): always.
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

  const enterLock =
    (container.state?.locks as Record<string, string> | undefined)
      ?.enter;
  if (enterLock) {
    return evaluateLock(enterLock, actor, container);
  }
  if (container.flags.has("enter_ok")) return true;
  if (await u.canEdit(actor, container)) return true;
  return false;
}

export function nameMatches(obj: IDBObj, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (q.startsWith("#") && obj.id === q.slice(1)) return true;
  if (obj.id === q) return true;
  const n = String(obj.state?.name ?? obj.name ?? "").toLowerCase();
  if (n.startsWith(q)) return true;
  const alias = String(obj.state?.alias ?? "").toLowerCase();
  return alias === q;
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
