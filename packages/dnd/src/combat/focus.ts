/**
 * Sticky combat focus — last target for +attack / +kill.
 * Stored under player state.dndCombat.focusId.
 *
 * Name matching supports partials + ordinals when duplicates share
 * a name:
 *   +attack gob          partial
 *   +attack 2.goblin     second goblin in the room
 *   +attack #142         dbref
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  listNameMatches,
  parseNameOrdinal,
  pickNameMatch,
} from "@ursamu/mush";

// deno-lint-ignore no-explicit-any
type Any = any;

export type CombatFocus = {
  focusId?: string;
  focusName?: string;
};

export function readFocus(me: IDBObj): CombatFocus {
  const bag = ((me.state as Any)?.dndCombat ?? {}) as CombatFocus;
  return {
    focusId: bag.focusId ? String(bag.focusId) : undefined,
    focusName: bag.focusName ? String(bag.focusName) : undefined,
  };
}

export async function setFocus(
  u: IUrsamuSDK,
  target: IDBObj,
): Promise<void> {
  const name = (u.util.displayName(target, u.me) || target.name ||
    target.id).split(";")[0];
  const prev = readFocus(u.me);
  const next = {
    ...prev,
    focusId: String(target.id),
    focusName: name,
  };
  await u.db.modify(u.me.id, "$set", {
    "data.dndCombat": next,
  });
  if (u.me.state) (u.me.state as Any).dndCombat = next;
}

export async function clearFocus(u: IUrsamuSDK): Promise<void> {
  const prev = readFocus(u.me);
  if (!prev.focusId) return;
  const next = { ...prev, focusId: undefined, focusName: undefined };
  await u.db.modify(u.me.id, "$set", {
    "data.dndCombat": next,
  });
  if (u.me.state) (u.me.state as Any).dndCombat = next;
}

function displayLabel(u: IUrsamuSDK, o: IDBObj): string {
  return (u.util.displayName(o, u.me) || o.name || o.id)
    .split(";")[0];
}

/** Format ambiguous hit list for the player. */
export function formatAmbiguous(
  u: IUrsamuSDK,
  hits: IDBObj[],
  query: string,
): string {
  const lines = hits.map((o, i) => {
    const n = i + 1;
    const label = displayLabel(u, o);
    const hp = (o.state as Any)?.dnd?.hp;
    const hpStr = hp
      ? ` [${hp.current ?? "?"}/${hp.max ?? "?"}]`
      : "";
    return `  ${n}. #${o.id} ${label}${hpStr}`;
  });
  return (
    `Which "${query}"?\n` +
    lines.join("\n") +
    `\nUse %ch2.${query}%cn or %ch#id%cn.`
  );
}

/**
 * Resolve a name among room objects (partial + ordinal + #id).
 * When multiple match without an ordinal, returns ambiguous list.
 */
export async function matchRoomTargets(
  u: IUrsamuSDK,
  roomId: string,
  rawArg: string,
): Promise<{
  target: IDBObj | null;
  hits: IDBObj[];
  error?: string;
}> {
  const arg = u.util.stripSubs(rawArg || "").trim();
  if (!arg) {
    return { target: null, hits: [], error: "No name given." };
  }

  // #dbref or bare id — unique
  if (/^#?\d+$/.test(arg)) {
    const t = await u.util.target(u.me, arg);
    if (!t || t.location !== roomId) {
      return {
        target: null,
        hits: [],
        error: "That target is not here.",
      };
    }
    return { target: t, hits: [t] };
  }

  // deno-lint-ignore no-explicit-any
  const here = await u.db.search({ location: roomId } as any);
  const { ordinal, name } = parseNameOrdinal(arg);
  const needle = name || arg;
  const hits = listNameMatches(here, needle);

  if (!hits.length) {
    // Fall back to util.target (inventory / moniker)
    const t = await u.util.target(u.me, arg);
    if (t && t.location === roomId) {
      return { target: t, hits: [t] };
    }
    return {
      target: null,
      hits: [],
      error: `Nothing here matches "${arg}".`,
    };
  }

  if (ordinal > 0) {
    const t = hits[ordinal - 1];
    if (!t) {
      return {
        target: null,
        hits,
        error:
          `Only ${hits.length} match "${needle}". ` +
          `Try 1.${needle}–${hits.length}.${needle}.\n` +
          formatAmbiguous(u, hits, needle),
      };
    }
    return { target: t, hits };
  }

  if (hits.length === 1) {
    return { target: hits[0], hits };
  }

  // Prefer pickNameMatch exact if unique exact
  const picked = pickNameMatch(here, arg);
  const exactCount = hits.filter((o) => {
    const parts = String(o.name || o.state?.name || "")
      .toLowerCase()
      .split(";");
    return parts.some((p) => p.trim() === needle.toLowerCase());
  }).length;
  if (exactCount === 1 && picked) {
    return { target: picked, hits: [picked] };
  }

  return {
    target: null,
    hits,
    error: formatAmbiguous(u, hits, needle),
  };
}

/**
 * Resolve attack/kill target: explicit arg, else sticky focus.
 * Sets focus when an explicit target is found.
 */
export async function resolveCombatTarget(
  u: IUrsamuSDK,
  roomId: string,
  rawArg: string,
): Promise<{ target: IDBObj | null; error?: string }> {
  const arg = u.util.stripSubs(rawArg || "").trim();
  if (arg) {
    const r = await matchRoomTargets(u, roomId, arg);
    if (!r.target) {
      return { target: null, error: r.error };
    }
    await setFocus(u, r.target);
    return { target: r.target };
  }
  const focus = readFocus(u.me);
  if (!focus.focusId) {
    return {
      target: null,
      error:
        "No target. Look at a foe and +focus, or " +
        "+attack <name> / 2.name / #id.",
    };
  }
  // Prefer live object by id in room
  // deno-lint-ignore no-explicit-any
  const byId = await u.db.search({ id: focus.focusId } as any);
  let t = byId[0] ?? null;
  if (t && t.location !== roomId) t = null;
  if (!t && focus.focusName) {
    const r = await matchRoomTargets(u, roomId, focus.focusName);
    // If focus name is ambiguous, keep requiring ordinal
    t = r.hits.length === 1 ? r.hits[0] : null;
    if (!t && r.hits.length > 1) {
      return {
        target: null,
        error:
          `Focus "${focus.focusName}" is ambiguous now.\n` +
          formatAmbiguous(u, r.hits, focus.focusName),
      };
    }
  }
  if (!t) {
    await clearFocus(u);
    return {
      target: null,
      error:
        "Your focus is gone. Look at a foe and choose again.",
    };
  }
  return { target: t };
}
