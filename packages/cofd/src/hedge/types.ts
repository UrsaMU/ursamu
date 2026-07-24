// CtL 2e Hedge types — rooms, hedgeways, sheet trail state.

/** Realm of a room for Hedge travel. */
export type HedgeRealm = "mortal" | "hedge" | "hollow";

/** Danger tier: trod safer, thorns worse (nav later). */
export type HedgeDanger = "trod" | "hedge" | "thorns";

/** Staff-tagged room metadata (data.hedge). */
export interface HedgeRoom {
  realm: HedgeRealm;
  danger: HedgeDanger;
  /** Trod rating 1–5 when danger is trod. */
  trodRating?: number;
  hollow?: {
    owners: string[];
    /** Hollow Merit dots 0–5 (enhancement budget). */
    rating: number;
    /**
     * Enhancement slugs (hob-alarm, size-2, …).
     * Dot cost must sum ≤ rating.
     */
    enhancements: string[];
    /**
     * Mortal room for Escape Route egress
     * (+hedge/escape).
     */
    escapeRoomId?: string;
    /**
     * Shadow Garden: fruit copies pending reappear.
     */
    shadowPending?: {
      slug: string;
      eatenAt: number;
      readyAt: number;
    }[];
  };
  /** Optional look / status flavor (fae / true layer). */
  flavor?: string;
  /** Mortal-facing flavor when set (soft dual). */
  maskFlavor?: string;
}

/** Lifecycle of a linked mortal↔Hedge portal. */
export type HedgewayState = "closed" | "open" | "dormant";

/** Persistent portal between a mortal room and a Hedge room. */
export interface Hedgeway {
  id: string;
  name: string;
  /**
   * Mortal-facing name (soft dual). True name is `name`.
   * Default when unset: "Strange passage".
   */
  maskName?: string;
  mortalRoomId: string;
  hedgeRoomId: string;
  /**
   * Key phrase: anyone who speaks it may open/enter
   * without Lost Glamour (see +hedge/open name=key).
   */
  keyPhrase?: string;
  state: HedgewayState;
  /** Epoch ms when open expires → dormant. */
  openUntil?: number;
  openedBy?: string;
  /** Season label when last established (free open while matches). */
  seasonStamp?: string;
  createdBy: string;
  createdAt: number;
}

/** Active chase vs the Hedge (see nav.ts). */
export interface HedgeNavState {
  goal: string;
  progress: number;
  hedgeProgress: number;
  target: number;
  turns: number;
  hedgeEdge: boolean;
  startedAt: number;
}

/** Light travel state on the changeling sheet. */
export interface HedgeSheetState {
  lastHedgewayId?: string;
  /** Mask-down trail; Huntsmen auto-succeed in same room while active. */
  trailUntil?: number;
  /** Prior Mask form before entering Hedge (restore on exit). */
  priorMaskOnEnter?: "mask" | "mien";
  /** True while body is in a Hedge/Hollow room (no Mask there). */
  inHedge?: boolean;
  /** In-progress navigation chase. */
  nav?: HedgeNavState;
  /** Carried goblin fruit (slugs + harvest time). */
  fruit?: { slug: string; gotAt: number }[];
  /** Timed fruit buffs (faeriePeach, ogrePepper, …). */
  fruitFlags?: { key: string; until: number }[];
  /** Primary Hollow room id (Easy Access / status). */
  homeHollowId?: string;
}

/** Global season for dormant free-open (cofd.hedge_config). */
export interface HedgeConfig {
  id: string;
  season: string;
  updatedAt: number;
  updatedBy: string;
}

export const HEDGE_CONFIG_ID = "global";
/** One "turn" ≈ 6s for open-duration Wyrd turns. */
export const HEDGE_TURN_MS = 6_000;
export const PORTAL_GLAMOUR_COST = 1;
