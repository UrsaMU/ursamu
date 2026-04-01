import type { IEvent } from "../../@types/IEvent.ts";
import { DBO } from "./database.ts";

export * from "./database.ts";
export const events = new DBO<IEvent>("server.events");

// ── @tag / @ltag registry ─────────────────────────────────────────────────

/** Global wizard-only tag: a named alias for a specific object. */
export interface IServerTag {
  /** DBO primary key — set to the tag name for easy lookup. */
  id: string;
  /** Tag name (lowercase, alphanumeric + hyphen). Same value as `id`. */
  name: string;
  /** ID of the tagged object. */
  objectId: string;
  /** ID of the wizard who registered the tag. */
  setterId: string;
  /** Unix timestamp (ms) when the tag was set. */
  createdAt: number;
}

/** Personal tag: player-scoped alias for an object (max 50 per owner). */
export interface ILtag {
  /** DBO primary key — set to `${ownerId}:${name}` for uniqueness. */
  id: string;
  /** Tag name (lowercase, alphanumeric + hyphen). */
  name: string;
  /** ID of the player who owns the tag. */
  ownerId: string;
  /** ID of the tagged object. */
  objectId: string;
  /** Unix timestamp (ms) when the tag was set. */
  createdAt: number;
}

export const serverTags = new DBO<IServerTag>("server.tags");
export const playerTags = new DBO<ILtag>("server.ltags");
