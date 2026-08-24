/**
 * Cyberpunk RED — Critical Injury Tables
 * Triggered when a damage roll contains 2+ natural 6s.
 * Roll 2d6 on the appropriate table.
 */
import type { ICriticalInjury } from "../db/schemas.ts";

export interface ICritEntry {
  roll: number;
  name: string;
  effects: string;
  deathSavePenalty: number;
  treatmentDV: number;
  requiresSurgery: boolean;
  treatmentNote: string;
}

export const BODY_CRITS: ICritEntry[] = [
  {
    roll: 2,
    name: "Dismembered Arm",
    effects: "Arm is gone. Drop everything held in that hand. +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 17,
    requiresSurgery: true,
    treatmentNote: "Surgery DV17",
  },
  {
    roll: 3,
    name: "Dismembered Hand",
    effects: "Hand is gone. Drop everything held. +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 17,
    requiresSurgery: true,
    treatmentNote: "Surgery DV17",
  },
  {
    roll: 4,
    name: "Collapsed Lung",
    effects: "-2 MOVE (min 1). +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 15,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV15 or Surgery DV15",
  },
  {
    roll: 5,
    name: "Broken Ribs",
    effects: "Re-suffer 5 bonus damage whenever you move more than 4m/yd in a turn.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV13 or Surgery DV13",
  },
  {
    roll: 6,
    name: "Broken Arm",
    effects: "Arm is unusable. Drop everything held in that hand.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV13 or Surgery DV13",
  },
  {
    roll: 7,
    name: "Foreign Object",
    effects: "Re-suffer 5 bonus damage whenever you move more than 4m/yd in a turn.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "First Aid DV13 or Paramedic DV13",
  },
  {
    roll: 8,
    name: "Broken Leg",
    effects: "-4 MOVE (min 1).",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV13 or Surgery DV13",
  },
  {
    roll: 9,
    name: "Torn Muscle",
    effects: "-2 to all Melee Attacks.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "First Aid DV13 or Paramedic DV13",
  },
  {
    roll: 10,
    name: "Spinal Injury",
    effects: "Next turn you cannot take an Action (can still move). +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 15,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV15 or Surgery DV15",
  },
  {
    roll: 11,
    name: "Crushed Fingers",
    effects: "-4 to all Actions with that hand.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV13 or Surgery DV15",
  },
  {
    roll: 12,
    name: "Dismembered Leg",
    effects: "Leg is gone. -6 MOVE (min 1). Cannot dodge ranged attacks. +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 17,
    requiresSurgery: true,
    treatmentNote: "Surgery DV17",
  },
];

export const HEAD_CRITS: ICritEntry[] = [
  {
    roll: 2,
    name: "Lost Eye",
    effects: "Eye is gone. -4 to all Ranged Attack and Perception checks (vision). +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 17,
    requiresSurgery: true,
    treatmentNote: "Surgery DV17",
  },
  {
    roll: 3,
    name: "Brain Injury",
    effects: "-2 to all Actions. +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 17,
    requiresSurgery: true,
    treatmentNote: "Surgery DV17",
  },
  {
    roll: 4,
    name: "Damaged Eye",
    effects: "-2 to all Ranged Attack and Perception checks (vision).",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV15 or Surgery DV13",
  },
  {
    roll: 5,
    name: "Concussion",
    effects: "-2 to all Actions.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "First Aid DV13 or Paramedic DV13",
  },
  {
    roll: 6,
    name: "Broken Jaw",
    effects: "-4 to all Actions involving speech.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV13 or Surgery DV13",
  },
  {
    roll: 7,
    name: "Foreign Object",
    effects: "Re-suffer 5 bonus damage whenever you move more than 4m/yd in a turn.",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "First Aid DV13 or Paramedic DV13",
  },
  {
    roll: 8,
    name: "Whiplash",
    effects: "+1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV13 or Surgery DV13",
  },
  {
    roll: 9,
    name: "Cracked Skull",
    effects: "Aimed shots to your head multiply damage x3 (instead of x2). +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 15,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV15 or Surgery DV15",
  },
  {
    roll: 10,
    name: "Damaged Ear",
    effects: "Cannot take a Move Action after moving more than 4m/yd. -2 to Perception (hearing).",
    deathSavePenalty: 0,
    treatmentDV: 13,
    requiresSurgery: false,
    treatmentNote: "Paramedic DV13 or Surgery DV13",
  },
  {
    roll: 11,
    name: "Crushed Windpipe",
    effects: "Cannot speak. +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 15,
    requiresSurgery: true,
    treatmentNote: "Surgery DV15",
  },
  {
    roll: 12,
    name: "Lost Ear",
    effects: "Ear is gone. Cannot take a Move Action after moving more than 4m/yd. -4 to Perception (hearing). +1 Death Save Penalty.",
    deathSavePenalty: 1,
    treatmentDV: 17,
    requiresSurgery: true,
    treatmentNote: "Surgery DV17",
  },
];

/** Roll result → entry for the given location. */
export const getCritEntry = (
  location: "head" | "body",
  roll: number
): ICritEntry => {
  const table = location === "head" ? HEAD_CRITS : BODY_CRITS;
  const clamped = Math.max(2, Math.min(12, roll));
  return table.find((e) => e.roll === clamped) ?? table[0];
};

/** Build an ICriticalInjury from a table entry. */
export const buildCritInjury = (
  location: "head" | "body",
  roll: number
): ICriticalInjury => {
  const entry = getCritEntry(location, roll);
  return {
    id: crypto.randomUUID(),
    location,
    roll,
    name: entry.name,
    effects: entry.effects,
    deathSavePenalty: entry.deathSavePenalty,
    treatmentDV: entry.treatmentDV,
    requiresSurgery: entry.requiresSurgery,
    treated: false,
  };
};
