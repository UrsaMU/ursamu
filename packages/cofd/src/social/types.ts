// Social Maneuvering -- CoFD 2e Core p.81-83.
// Types for the persistent social encounter record.

export type Impression = "hostile" | "average" | "good" | "excellent" | "perfect";

export const IMPRESSION_ORDER: Impression[] = [
  "hostile",
  "average",
  "good",
  "excellent",
  "perfect",
];

/** Real-time/scene cadence per impression tier (CoFD 2e p.82). */
export const IMPRESSION_INTERVAL: Record<Impression, string> = {
  hostile: "cannot roll",
  average: "one week",
  good: "one day",
  excellent: "one hour",
  perfect: "one turn",
};

export type LeverageKind = "soft" | "hard";

export interface LeverageEntry {
  kind: LeverageKind;
  /** Sub-type label: aspiration | vice | gift | bribe | threat | blackmail, etc. */
  flavor: string;
  text: string;
  doorsRemoved: number;
  when: number;
}

export interface SocialManeuver {
  id: string;
  initiatorId: string;
  initiatorName: string;
  subjectId: string;
  subjectName: string;
  goal: string;
  /** Doors at the start (base = min(Resolve,Composure) plus situational adds). */
  doorsTotal: number;
  /** Doors that have been opened so far. */
  doorsOpen: number;
  impression: Impression;
  /** Cumulative -1 per failed door roll (CoFD 2e p.82). Persists across rolls. */
  penalty: number;
  leverage: LeverageEntry[];
  /** Forced doors attempted -- success or fail is terminal. */
  forced: boolean;
  /** True once final door opens -- capitulation banner fires once. */
  resolved: boolean;
  /** Subject is immune to further attempts from this initiator. */
  immune: boolean;
  /** Reason captured at the end (resolved | abandoned | dramatic-fail | force-fail). */
  endReason?: string;
  createdAt: number;
  updatedAt: number;
}
