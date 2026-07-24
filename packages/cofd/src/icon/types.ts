// Icons — lost pieces of a changeling's self (CtL 2e, simplified).

/** What the Icon once was. */
export type IconKind =
  | "memory"
  | "skill"
  | "emotion"
  | "relationship"
  | "other";

export type IconStatus = "lost" | "held" | "spent" | "recovered";

/** One Icon on a changeling sheet. */
export interface IconRecord {
  id: string;
  name: string;
  kind: IconKind;
  /** Who or what holds it (Keeper, rival, free). */
  heldBy: string;
  description: string;
  status: IconStatus;
  /** Optional skill key if kind=skill (for recover hooks later). */
  skillKey?: string;
  createdAt: number;
  spentAt?: number;
  recoveredAt?: number;
  /** Free note when spent (what was bought with it). */
  spentNote?: string;
}

export const ICON_KINDS: readonly IconKind[] = [
  "memory",
  "skill",
  "emotion",
  "relationship",
  "other",
];
