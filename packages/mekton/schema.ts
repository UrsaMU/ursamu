import { DBO } from "@ursamu/ursamu";

export interface ILifepathSibling {
  gender: "male" | "female";
  relativeAge: "older" | "younger" | "twin";
  feeling: "dislikes" | "likes" | "neutral" | "hero-worships" | "hates";
}

export interface ILifepathFriend {
  gender: "male" | "female";
  type: string;
}

export interface ILifepathEnemy {
  type: string;
  causeOfHatred: string;
  whoHates: "them" | "you" | "mutual";
  reaction: string;
}

export interface IRomance {
  status: "involved" | "uninvolved" | "recovering";
  detail: string;
}

export interface ILifepathEvent {
  term: number;
  profession: string;
  dangerous: boolean;
  event: string;
  detail: string;
  accidentEffect?: { stat: "att" | "ref"; delta: number };
}

export interface ICareerTerm {
  profession: string;
  dangerous: boolean;
  chosenSkills: string[];
  equipmentBonus: number;
}

export interface IEquipmentItem {
  name: string;
  category:
    | "melee"
    | "archery"
    | "handgun"
    | "smg"
    | "rifle"
    | "shotgun"
    | "heavy"
    | "armor"
    | "clothing"
    | "tool"
    | "other";
  weight: number;
  cost: number;
  sp?: number;
  location?: string;
  wa?: number;
  damage?: string;
  range?: string;
  shots?: number;
  bv?: number;
  conceal?: "P" | "J" | "L" | "N";
  tl?: number;
  notes?: string;
}

export type StatKey =
  | "att"
  | "bod"
  | "cl"
  | "emp"
  | "int"
  | "luck"
  | "ma"
  | "ref"
  | "tech"
  | "edu";

export interface IMektonStats {
  att: number;
  bod: number;
  cl: number;
  emp: number;
  int: number;
  luck: number;
  ma: number;
  ref: number;
  tech: number;
  edu: number;
}

export interface IMektonWounds {
  head: number;
  torso: number;
  rArm: number;
  lArm: number;
  rLeg: number;
  lLeg: number;
}

export type WoundLocation = keyof IMektonWounds;

export interface IMektonChar {
  id: string;
  playerId: string;
  playerName: string;

  stats: IMektonStats;
  skills: Record<string, number>;

  lifepath: {
    socialStatus: number;
    startingCash: number;
    parentStatus: string;
    familyStanding: "good" | "bad";
    familyCrisis?: string;
    familialGoal?: string;
    siblings: ILifepathSibling[];
    friends: ILifepathFriend[];
    enemies: ILifepathEnemy[];
    romance: IRomance | null;
    appearance: {
      hairColor: string;
      hairStyle: string;
      eyeColor: string;
      personalityTrait: string;
      valueMost: string;
      valuedPossession: string;
      valuedPerson: string;
    };
    professionalEvents: ILifepathEvent[];
  };

  charType: "rookie" | "professional" | null;
  rookieTemplate: string | null;
  careers: ICareerTerm[];
  age: number;

  equipment: IEquipmentItem[];
  cash: number;

  statMethod: "random" | "concept" | "cinematic" | null;
  statPointPool: number | null;

  chargenStatus: "draft" | "submitted" | "approved" | "revision";
  submittedAt?: number;
  approvedAt?: number;
  reviewNote?: string;

  wounds: IMektonWounds;
  stunned: boolean;
  luckRemaining: number;
  firstAidApplied: Record<string, boolean>;
}

export interface IMektonReview {
  id: string;
  charId: string;
  reviewerId: string;
  reviewerName: string;
  action: "approved" | "rejected";
  note?: string;
  timestamp: number;
}

export const chars = new DBO<IMektonChar>("mekton.chars");
export const reviews = new DBO<IMektonReview>("mekton.reviews");
