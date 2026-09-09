// core/initiative.ts -- pure initiative state + roll helpers.
//
// M20 canon: Dex + Wits + 1d10 (NOT exploded). Highest goes first. Ties
// resolved by Dex, then Wits, then random. Modifiers (armor, weapon, etc.)
// adjust the total. Logic here is mechanics-only -- persistence, narration,
// and SDK plumbing live in commands/init.ts.

export interface IInitEntry {
  charId:   string;
  playerId: string;
  /** Display name as it should appear in the order (deed-aware at command level). */
  name:     string;
  dex:      number;
  wits:     number;
  /** The single d10 rolled (1..10, never exploded). */
  d10:      number;
  /** Armor/weapon adjustments, applied to total. */
  modifier: number;
  /** dex + wits + d10 + modifier. */
  total:    number;
}

export interface IInitState {
  /** 1 on first roll; bumped each full cycle. */
  round:     number;
  startedAt: number;
  /** Index into order[] whose turn it is. */
  current:   number;
  /** Sorted highest total first. */
  order:     IInitEntry[];
}

/** Roll a fresh initiative entry for a character. */
export function rollInitiative(opts: {
  charId:    string;
  playerId:  string;
  name:      string;
  dex:       number;
  wits:      number;
  modifier?: number;
  /** Optional injector returning a float in [0,1). For test determinism. */
  roller?:   () => number;
}): IInitEntry {
  const modifier = Math.trunc(opts.modifier ?? 0);
  const r = opts.roller ?? Math.random;
  const raw = r();
  // Clamp into [0,1) then map to 1..10. Defensive against bad rollers.
  const norm = Number.isFinite(raw) ? Math.max(0, Math.min(0.9999999, raw)) : 0;
  const d10 = Math.floor(norm * 10) + 1;
  const dex  = Math.max(1, Math.trunc(opts.dex));
  const wits = Math.max(1, Math.trunc(opts.wits));
  return {
    charId:   opts.charId,
    playerId: opts.playerId,
    name:     opts.name,
    dex,
    wits,
    d10,
    modifier,
    total:    dex + wits + d10 + modifier,
  };
}

/** total desc -> dex desc -> wits desc -> random. */
export function compareEntries(a: IInitEntry, b: IInitEntry): number {
  if (b.total !== a.total) return b.total - a.total;
  if (b.dex   !== a.dex)   return b.dex   - a.dex;
  if (b.wits  !== a.wits)  return b.wits  - a.wits;
  return Math.random() < 0.5 ? -1 : 1;
}

/** Insert an entry into state (creating fresh state if undefined), keeping sort. */
export function insertEntry(
  state: IInitState | undefined,
  entry: IInitEntry,
): IInitState {
  if (!state) {
    return {
      round:     1,
      startedAt: Date.now(),
      current:   0,
      order:     [entry],
    };
  }
  // Drop any prior entry for this char before re-adding.
  const filtered = state.order.filter((e) => e.charId !== entry.charId);
  const next = [...filtered, entry].sort(compareEntries);
  // Keep `current` pointing at the same character if possible.
  const curChar = state.order[state.current]?.charId;
  const newCurrent = curChar
    ? Math.max(0, next.findIndex((e) => e.charId === curChar))
    : 0;
  return {
    ...state,
    order:   next,
    current: newCurrent === -1 ? 0 : newCurrent,
  };
}

/** Advance current; wrap to 0 and bump round. */
export function nextTurn(state: IInitState): IInitState {
  if (state.order.length === 0) return state;
  const next = state.current + 1;
  if (next >= state.order.length) {
    return { ...state, current: 0, round: state.round + 1 };
  }
  return { ...state, current: next };
}

/** Sentinel for "no combat". Caller persists this. */
export function clearInit(): IInitState | null {
  return null;
}

/** Convenience: drop one character from the order. */
export function removeEntry(state: IInitState, charId: string): IInitState | null {
  const filtered = state.order.filter((e) => e.charId !== charId);
  if (filtered.length === 0) return null;
  // Keep pointer on the same actor when possible.
  const curChar = state.order[state.current]?.charId;
  let newCurrent = curChar && curChar !== charId
    ? filtered.findIndex((e) => e.charId === curChar)
    : Math.min(state.current, filtered.length - 1);
  if (newCurrent < 0) newCurrent = 0;
  return { ...state, order: filtered, current: newCurrent };
}
