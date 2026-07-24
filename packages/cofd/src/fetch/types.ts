// Fetch — fae double (CtL 2e p.233+).

/** Echo power slug. */
export type EchoSlug =
  | "attuned"
  | "normalcy"
  | "heart-of-wax"
  | "enter-hedge"
  | "summon-shard"
  | "mimic-contract"
  | "shadow-boxing"
  | "shadow-step"
  | "death-of-glamour"
  | "call-huntsmen";

export interface EchoDef {
  slug: EchoSlug;
  name: string;
  /** Minimum Wyrd to learn/use. */
  minWyrd: number;
  /** Automatic for all fetches. */
  automatic?: boolean;
  glamour: number;
  description: string;
  book: string;
}

/** Link data on changeling and/or fetch sheets. */
export interface FetchLinkState {
  /** Changeling sheet: id of fetch player/NPC. */
  fetchId?: string;
  fetchName?: string;
  flaw?: string;
  materials?: string;
  /** Fetch sheet: original changeling id. */
  originalId?: string;
  originalName?: string;
  /** Owned Echo slugs (beyond automatic attuned). */
  echoes: string[];
  /** Normalcy Echo on (default true). */
  normalcyOn?: boolean;
  /** Met original face-to-face (Mimic Contract). */
  metOriginal?: boolean;
  /** Story mode note. */
  storyMode?: "adversary" | "other-half" | "hard-lesson" | "unknown";
}
