// Huntsman hunt loop + Dread Powers (CtL p.262–266).

export type HuntStage =
  | "scent"
  | "trail"
  | "closing"
  | "cornered"
  | "ended";

/** On the quarry (changeling) sheet. */
export interface QuarryHuntState {
  active: boolean;
  hunterId: string;
  hunterName: string;
  stage: HuntStage;
  /** 0–10 progress toward capture. */
  progress: number;
  startedAt: number;
  /** Last track successes. */
  lastTrackAt?: number;
  note?: string;
}

/** On the Huntsman sheet. */
export interface HunterState {
  quarryId?: string;
  quarryName?: string;
  /** Owned Dread Power slugs. */
  powers: string[];
  /** Panoply tool names (weapons/tools). */
  panoply: string[];
  /** Bastion holding the heart (ST). */
  heartBastion?: string;
  title?: string;
  aspiration?: string;
  stage?: HuntStage;
  progress?: number;
}

export type HuntsmanPowerSlug =
  | "among-the-sheep"
  | "apex-predator"
  | "command-the-herald"
  | "heart-of-iron"
  | "hungry-heart"
  | "hunters-panoply"
  | "hunters-senses"
  | "inescapable-snare"
  | "kindred-spirits"
  | "surprise-entrance"
  | "watchful-gaze";

export interface HuntsmanPowerDef {
  slug: HuntsmanPowerSlug;
  name: string;
  glamour: number;
  willpower: number;
  description: string;
  book: string;
}
