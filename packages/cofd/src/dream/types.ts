// Oneiromancy light — Bastions, Roads & dream form (CtL 2e p.215+).

export type DreamGate = "ivory" | "horn";

/** Active dream presence on a sheet. */
export interface DreamState {
  active: boolean;
  gate: DreamGate;
  /** Owner id of Bastion, or "self" / "roads". */
  bastionOf: string;
  bastionName?: string;
  fortification: number;
  power: number;
  finesse: number;
  resistance: number;
  dreamHealth: number;
  dreamHealthMax: number;
  /** Subtle weaves remaining this dream (scene budget). */
  weavesLeft: number;
  enteredAt: number;
  /** Left own Bastion → no WP for rest. */
  leftOwnBastion?: boolean;
  /** Current dream role (Playing a Role). */
  role?: string;
  /** Current Dreaming Roads room id (body/mind location). */
  roadRoomId?: string;
  /** Labels visited on the Roads this dream. */
  roadPath?: string[];
}

/** Room-tagged Bastion (state.dream on room). */
export interface BastionRoom {
  ownerId: string;
  ownerName?: string;
  name: string;
  fortification: number;
  flavor?: string;
  createdAt: number;
}

export type WeaveEffect = string;

export interface WeaveDef {
  slug: string;
  name: string;
  glamour: number;
  target: number;
  description: string;
  book: string;
}
