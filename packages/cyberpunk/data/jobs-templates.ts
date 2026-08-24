/**
 * Cyberpunk RED — Job Board Seed Templates
 * Pre-written job postings for GMs to seed the board with.
 * These provide ready-made mission hooks in Night City style.
 */
import type { IJob } from "../db/schemas.ts";

type JobTemplate = Omit<IJob, "id" | "postedBy" | "postedByName" | "takenBy" | "takenByNames" | "status" | "createdAt">;

export const JOB_TEMPLATES: JobTemplate[] = [
  // ── Street Level ──────────────────────────────────────────────────────────
  {
    title: "Package Delivery — No Questions Asked",
    description: "Transport a sealed package from the Night Market at Jig-Jig Street to a contact in Heywood. Don't open it. Don't be late. 3 hours.",
    payAmount: 200,
    payCategory: "costly",
    dangerLevel: "low",
    requiresRole: undefined,
    requiresSkill: "drive_land_vehicle",
    minSkillLevel: 2,
    minTeamSize: 1,
  },
  {
    title: "Muscle for a Night Market Opening",
    description: "A Fixer is opening a Night Market in Watson. Needs 2-4 armed Solos to stand watch and look intimidating. 4 hours. No killing unless necessary.",
    payAmount: 300,
    payCategory: "costly",
    dangerLevel: "low",
    requiresRole: undefined,
    requiresSkill: "intimidation",
    minSkillLevel: 0,
    minTeamSize: 2,
  },
  {
    title: "Find a Missing Person",
    description: "A corp drone disappeared after leaving their office in City Center. Family suspects foul play. Find them — alive if possible. No corp contact.",
    payAmount: 500,
    payCategory: "costly",
    dangerLevel: "medium",
    requiresSkill: "tracking",
    minSkillLevel: 4,
    minTeamSize: 1,
  },

  // ── Corporate Jobs ────────────────────────────────────────────────────────
  {
    title: "Extract Corporate Data",
    description: "Infiltrate a mid-tier Militech satellite office in the financial district. Copy a specific research file from their server. No kills, no alerts. Netrunner and backup needed.",
    payAmount: 2000,
    payCategory: "expensive",
    dangerLevel: "high",
    requiresRole: "netrunner",
    minSkillLevel: 6,
    minTeamSize: 2,
  },
  {
    title: "Guard Corporate Convoy",
    description: "Escort a Biotechnica transport through the Combat Zone from the Port to the Research Ward. Three vehicles. Expect gang interference.",
    payAmount: 1500,
    payCategory: "expensive",
    dangerLevel: "high",
    minTeamSize: 4,
  },
  {
    title: "Sabotage a Rivals Production Line",
    description: "A mid-tier Corp wants a competitor's manufacturing plant in the Industrial Zone offline for 48 hours. Tech with demolitions expertise required.",
    payAmount: 3000,
    payCategory: "expensive",
    dangerLevel: "high",
    requiresRole: "tech",
    requiresSkill: "demolitions",
    minSkillLevel: 4,
    minTeamSize: 3,
  },

  // ── Street Operations ─────────────────────────────────────────────────────
  {
    title: "Retrieve Stolen Cyberware",
    description: "A ripperdoc had their clinic robbed. Specific high-value cyberware taken. Recover it. The thieves are Maelstrom — approach with caution.",
    payAmount: 1000,
    payCategory: "expensive",
    dangerLevel: "high",
    minTeamSize: 2,
  },
  {
    title: "Night Market Protection Racket — Reverse It",
    description: "Edgerunner Fixer needs a local protection racket off their Night Market. The gang running it has 6-8 members. Permanent solution only.",
    payAmount: 1500,
    payCategory: "expensive",
    dangerLevel: "high",
    minTeamSize: 3,
  },
  {
    title: "Medical Supply Run — Combat Zone",
    description: "A street clinic in the Combat Zone is out of critical supplies. Run into the Zone, hit a derelict Trauma Team depot, and bring back what they need. Medtech welcome.",
    payAmount: 800,
    payCategory: "costly",
    dangerLevel: "high",
    requiresSkill: "paramedic",
    minTeamSize: 2,
  },

  // ── Netrunner Jobs ────────────────────────────────────────────────────────
  {
    title: "Wipe a Criminal Record",
    description: "A client needs their file purged from NCPD databases. Requires deep net infiltration. Trace-clean exit mandatory.",
    payAmount: 2500,
    payCategory: "expensive",
    dangerLevel: "medium",
    requiresRole: "netrunner",
    requiresSkill: "interface",
    minSkillLevel: 6,
    minTeamSize: 1,
  },
  {
    title: "Plant Evidence in Corporate Systems",
    description: "Frame a mid-level Arasaka exec for embezzlement. Need a Netrunner inside their office systems. Physical team required for distraction.",
    payAmount: 4000,
    payCategory: "very_expensive",
    dangerLevel: "extreme",
    requiresRole: "netrunner",
    minTeamSize: 2,
  },

  // ── Medtech / Fixer Opportunities ────────────────────────────────────────
  {
    title: "Field Medic — Corporate Skirmish Zone",
    description: "Both sides of a local gang war need field stabilization for their wounded. Work both sides, don't get shot. High-risk, high-reward for a Medtech.",
    payAmount: 1200,
    payCategory: "expensive",
    dangerLevel: "high",
    requiresRole: "medtech",
    requiresSkill: "paramedic",
    minSkillLevel: 4,
    minTeamSize: 1,
  },
  {
    title: "Source Rare Pharmaceuticals",
    description: "A hospital needs black-market medical supplies that are officially embargoed. Fixer needs to source three categories: anesthetics, antibiotics, biosculpt compounds. Large quantity.",
    payAmount: 2000,
    payCategory: "expensive",
    dangerLevel: "medium",
    requiresRole: "fixer",
    minTeamSize: 1,
  },

  // ── High-End / Dangerous ──────────────────────────────────────────────────
  {
    title: "Extract a Corpo Defector",
    description: "A mid-level Kang Tao scientist wants out. Corporate kill teams are already mobilized. Extract them from the airport before their flight is cancelled permanently.",
    payAmount: 8000,
    payCategory: "very_expensive",
    dangerLevel: "extreme",
    minTeamSize: 4,
  },
  {
    title: "Infiltrate the Nomad Supply Chain",
    description: "A fixer wants intelligence on which Nomad clan is running medical tech through the Badlands. Infiltrate, get intel, get out without starting a war.",
    payAmount: 5000,
    payCategory: "very_expensive",
    dangerLevel: "extreme",
    minTeamSize: 3,
  },
  {
    title: "Take Down a Fixer Rival",
    description: "An established Night Market operator is muscling in on our client's territory. Permanent solution. No witnesses. Corp-style hit.",
    payAmount: 10000,
    payCategory: "very_expensive",
    dangerLevel: "extreme",
    minTeamSize: 4,
  },
];
