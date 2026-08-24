/**
 * Cyberpunk RED — Role Definitions and Ability Mechanics
 * All 10 roles with their Role Ability, rank descriptions, and mechanical hooks.
 */
import type { Role } from "../db/schemas.ts";

export interface IRoleDef {
  name: Role;
  displayName: string;
  abilityName: string;
  description: string;
  rankDescriptions: Record<number, string>;
  /** Skill(s) directly tied to this role ability (required for checks). */
  linkedSkills: string[];
}

export const ROLES: IRoleDef[] = [
  {
    name: "rockerboy",
    displayName: "Rockerboy",
    abilityName: "Charismatic Impact",
    description:
      "Influence fans through performance, personality, and art. Roll Charismatic Impact + 1d10 vs DV based on crowd size.",
    linkedSkills: ["acting", "play_instrument", "composition"],
    rankDescriptions: {
      1: "Small local clubs. Single fan: buy you drinks. Group of 6: get autographs.",
      2: "Small local clubs. Single fan: minor favors. Group: befriend you.",
      3: "Well-known clubs. Single fan: major favors (romance, recommendations). Group: hang out / supply support.",
      4: "Well-known clubs. Single fan: commit minor crimes. Group: acts as personal posse.",
      5: "Large clubs. Single fan: commits minor crimes. Large groups: commit crimes / support info networks.",
      6: "Large clubs. Single fan: risks their life. Large group: acts as info network.",
      7: "Small concert halls / local video feed. Fan risks life. Large group: commits minor crimes.",
      8: "Small concert halls. Fan commits major crimes. Large group: riot, destroy, kill on command.",
      9: "Large concert halls / national feed. Fan commits major crimes. Huge group: riot or destroy.",
      10: "Stadiums / international. Fan sacrifices themselves. Groups act as private army.",
    },
  },
  {
    name: "solo",
    displayName: "Solo",
    abilityName: "Combat Awareness",
    description:
      "Distribute Combat Awareness points (equal to Rank) among combat bonuses as a free Action. Rebalance each round.",
    linkedSkills: ["handgun", "shoulder_arms", "melee_weapon", "athletics"],
    rankDescriptions: {
      1: "1 pt: Damage Deflection (1), Initiative Reaction (+1 init), Spot Weakness (+1 dmg), Threat Detection (+1 Perception).",
      2: "2 pts available. Can take Fumble Recovery (4 pts) once enough rank.",
      3: "3 pts available.",
      4: "4 pts available. Fumble Recovery (4 pts) is now achievable.",
      5: "5 pts. Damage Deflection (4 pts) = -2 first damage.",
      6: "6 pts. Precision Attack (3 pts) = +1 to attacks.",
      7: "7 pts.",
      8: "8 pts. Damage Deflection (8 pts) = -4 first damage.",
      9: "9 pts. Precision Attack (6 pts) = +2 to attacks.",
      10: "10 pts. Precision Attack (9 pts) = +3 to attacks. Damage Deflection (10 pts) = -5.",
    },
  },
  {
    name: "netrunner",
    displayName: "Netrunner",
    abilityName: "Interface",
    description:
      "Jack into NET architectures and use Interface Abilities. NET Actions per turn scales with Rank.",
    linkedSkills: ["interface", "electronics_security_tech", "basic_tech"],
    rankDescriptions: {
      1: "2 NET Actions/turn. Abilities: Backdoor, Cloak, Control, Eye-Dee, Pathfinder, Scanner, Slide, Virus, Zap.",
      2: "2 NET Actions/turn.",
      3: "2 NET Actions/turn.",
      4: "3 NET Actions/turn.",
      5: "3 NET Actions/turn.",
      6: "3 NET Actions/turn.",
      7: "4 NET Actions/turn.",
      8: "4 NET Actions/turn.",
      9: "4 NET Actions/turn.",
      10: "5 NET Actions/turn.",
    },
  },
  {
    name: "medtech",
    displayName: "Medtech",
    abilityName: "Medicine",
    description:
      "Gain specialties in Surgery, Pharmaceuticals, or Cryosystem Operation. Keep people alive who should be dead.",
    linkedSkills: ["surgery", "pharmaceuticals", "cryosystem_operation", "first_aid", "paramedic"],
    rankDescriptions: {
      1: "1 specialty rank. Surgery DV13 access; basic pharma (Antibiotic, Rapidetox).",
      2: "2 specialty ranks total.",
      3: "3 specialty ranks.",
      4: "4 specialty ranks. Registered access to facility Cryotank (Cryosystem Rank 2).",
      5: "5 specialty ranks.",
      6: "6 specialty ranks.",
      7: "7 specialty ranks.",
      8: "8 specialty ranks. Personal Cryotanks (Cryosystem Rank 3+).",
      9: "9 specialty ranks.",
      10: "10 specialty ranks. Full surgical and pharmaceutical capability.",
    },
  },
  {
    name: "tech",
    displayName: "Tech",
    abilityName: "Maker",
    description:
      "Gain specialties in Field, Upgrade, Fabrication, or Invention Expertise. Fix, improve, modify, make, and invent.",
    linkedSkills: [
      "basic_tech", "cybertech", "electronics_security_tech",
      "weaponstech", "land_vehicle_tech", "air_vehicle_tech",
    ],
    rankDescriptions: {
      1: "2 Maker specialty ranks across Field/Upgrade/Fabrication/Invention.",
      2: "4 specialty ranks total.",
      3: "6 specialty ranks.",
      4: "8 specialty ranks.",
      5: "10 specialty ranks.",
      6: "12 specialty ranks.",
      7: "14 specialty ranks.",
      8: "16 specialty ranks.",
      9: "18 specialty ranks.",
      10: "20 specialty ranks. Master maker.",
    },
  },
  {
    name: "media",
    displayName: "Media",
    abilityName: "Credibility",
    description:
      "Publish stories and access information. GM rolls twice weekly for passive rumors. Publish scoops for real-world impact.",
    linkedSkills: ["composition", "photography_film", "library_search", "conversation"],
    rankDescriptions: {
      1: "Local honcho access. Neighborhood audience. Believability 2/10.",
      2: "Same as 1. Can cause incremental local change.",
      3: "City gang/minor politician access. Local contributor audience. Believability 3/10.",
      4: "Same as 3. Direct local change.",
      5: "Major city player access. Citywide audience. Believability 4/10.",
      6: "Same as 5. City-wide change.",
      7: "Corp president/mayor access. Statewide audience. Believability 5/10.",
      8: "Same as 7. Multi-city change.",
      9: "Divisional head access. Nationwide. Believability 6/10. Country-wide change.",
      10: "Board member access. International audience. Believability 7/10. Global change.",
    },
  },
  {
    name: "exec",
    displayName: "Exec",
    abilityName: "Teamwork",
    description:
      "Build a corporate team with visible jobs and covert roles. Roll Teamwork Rank + 1d10 vs DV8 to activate.",
    linkedSkills: ["bureaucracy", "business", "persuasion", "tactics"],
    rankDescriptions: {
      1: "1 team member. Combat Number 8 (SP 7, HP 20).",
      2: "2 team members. Combat Number 8.",
      3: "3 team members. Combat Number 10 (SP 9, HP 25).",
      4: "4 team members. Combat Number 10.",
      5: "5 team members. Combat Number 11 (SP 11, HP 30).",
      6: "6 team members. Combat Number 11.",
      7: "7 team members. Combat Number 12 (SP 13, HP 35).",
      8: "8 team members. Combat Number 13 (SP 15, HP 40).",
      9: "9 team members. Combat Number 15 (SP 15, HP 45).",
      10: "10 team members. Combat Number 16 (SP 15, HP 50).",
    },
  },
  {
    name: "lawman",
    displayName: "Lawman",
    abilityName: "Backup",
    description:
      "Call for backup. Roll 1d10; if result ≤ Backup Rank, backup arrives. Quality scales with Rank.",
    linkedSkills: ["handgun", "shoulder_arms", "brawling", "tactics", "interrogation"],
    rankDescriptions: {
      1: "1-in-10 chance. 1 officer: Combat Number 8 (SP 7, HP 20).",
      2: "2-in-10 chance. 1 officer: Combat Number 8.",
      3: "3-in-10 chance. 2 officers: Combat Number 10.",
      4: "4-in-10 chance. 2 officers: Combat Number 10.",
      5: "5-in-10 chance. 3 officers: Combat Number 11.",
      6: "6-in-10 chance. 3 officers: Combat Number 11.",
      7: "7-in-10 chance. 4 officers: Combat Number 13.",
      8: "8-in-10 chance. 4 officers: Combat Number 13.",
      9: "9-in-10 chance. 5 officers: Combat Number 15.",
      10: "Always. Full squad: Combat Number 16 (SP 15, HP 50).",
    },
  },
  {
    name: "fixer",
    displayName: "Fixer",
    abilityName: "Operator",
    description:
      "Source goods on the black market (Reach), strike deals (Haggle), navigate cultures (Grease). Organize Night Markets.",
    linkedSkills: ["trading", "streetwise", "conversation", "bribery"],
    rankDescriptions: {
      1: "Contacts: Local honchos. Reach: Cheap/Everyday. Haggle: 10% off/on. Grease: Immediate neighborhood.",
      2: "Same as 1.",
      3: "Contacts: City gang honcho, minor politician. Reach: Expensive. Haggle: Buy 5 get 1 free. Grease: +1 culture.",
      4: "Same as 3.",
      5: "Contacts: Major city player. Reach: Night Market (all categories). Haggle: +20% job pay. Grease: +2 cultures.",
      6: "Same as 5.",
      7: "Contacts: Corp president, mayor. Reach: Very Expensive solo. Haggle: Luxury on installment. Grease: +3 cultures.",
      8: "Same as 7.",
      9: "Contacts: Divisional head. Reach: Luxury. Midnight Market access. Haggle: 20% off/on. Grease: Corp/gov.",
      10: "Contacts: World leaders, Corp heads. Reach: Super Luxury. Haggle: Double pay on dangerous jobs.",
    },
  },
  {
    name: "nomad",
    displayName: "Nomad",
    abilityName: "Moto",
    description:
      "Vehicle expertise and Family Motorpool. Add Moto Rank to all vehicle Skill checks. Gain vehicles/upgrades on rank up.",
    linkedSkills: [
      "drive_land_vehicle", "pilot_air_vehicle", "pilot_sea_vehicle",
      "land_vehicle_tech", "air_vehicle_tech", "sea_vehicle_tech",
    ],
    rankDescriptions: {
      1: "+1 to vehicle checks. Motorpool: 1 Cheap vehicle OR 1 vehicle upgrade (Rank 1).",
      2: "+2 to vehicle checks. Motorpool: 1 Everyday vehicle OR 1 upgrade (Rank 2).",
      3: "+3. Motorpool: 1 Costly vehicle OR 1 upgrade (Rank 3).",
      4: "+4. Motorpool: 1 Premium vehicle OR 1 upgrade (Rank 4).",
      5: "+5. Motorpool: 1 Expensive vehicle.",
      6: "+6. Motorpool: 1 Very Expensive vehicle.",
      7: "+7. Motorpool: 1 Luxury vehicle.",
      8: "+8. Motorpool: 1 Luxury vehicle.",
      9: "+9. Motorpool: 1 Super Luxury vehicle.",
      10: "+10. Family leader. All Family Vehicles out at once. Future purchases at market price.",
    },
  },
];

export const getRole = (name: Role): IRoleDef =>
  ROLES.find((r) => r.name === name) ?? ROLES[0];

/** NET actions per turn for Netrunner Interface rank. */
export const netActionsPerTurn = (rank: number): number => {
  if (rank >= 10) return 5;
  if (rank >= 7) return 4;
  if (rank >= 4) return 3;
  return 2;
};

/**
 * Solo Combat Awareness: distribute `rank` points among bonuses.
 * Returns the maximum allocation for each bonus type.
 */
export interface ISoloBonuses {
  damageDeflection: number;  // 2/4/6/8/10 pts → 1/2/3/4/5 reduction
  fumbleRecovery: boolean;    // 4 pts
  initiativeReaction: number; // 1 pt each
  precisionAttack: number;   // 3/6/9 pts → +1/+2/+3
  spotWeakness: number;      // 1 pt each
  threatDetection: number;   // 1 pt each
}

/** Validate that a solo bonus allocation does not exceed available points. */
export const validateSoloBonuses = (
  bonuses: ISoloBonuses,
  rank: number
): boolean => {
  const total =
    bonuses.damageDeflection * 2 +
    (bonuses.fumbleRecovery ? 4 : 0) +
    bonuses.initiativeReaction +
    Math.min(bonuses.precisionAttack, 3) * 3 +
    bonuses.spotWeakness +
    bonuses.threatDetection;
  return total <= rank;
};

/** Damage deflection amount from points spent. */
export const deflectionFromPoints = (points: number): number =>
  points <= 0 ? 0 : Math.floor(points / 2);

/** Precision attack bonus from points spent. */
export const precisionFromPoints = (points: number): number =>
  Math.min(3, Math.floor(points / 3));
