/**
 * Cyberpunk RED — Drugs and Pharmaceuticals
 * All drugs from the core rulebook: street drugs, medtech synthetics, and combat chems.
 */
import type { PriceCategory } from "../db/schemas.ts";

export interface IDrugDef {
  name: string;
  displayName: string;
  type: "pharma" | "street" | "combat";
  /** Whether a Medtech with Pharmaceuticals specialty can synthesize this. */
  synthesizable: boolean;
  /** Minimum Pharmaceuticals rank to synthesize. */
  minPharmaRank?: number;
  synthesisDV?: number;
  synthesisMaterials: PriceCategory;
  priceCategory: PriceCategory;
  costEb: number;
  /** Duration in milliseconds (for real-time tracking). 0 = instant effect. */
  durationMs: number;
  durationDisplay: string;
  effects: string;
  sideEffects?: string;
  /** Humanity Loss on use (0 for most). */
  hl?: number;
}

export const DRUGS: IDrugDef[] = [
  // ── Medtech Pharmaceuticals ──────────────────────────────────────────────
  {
    name: "antibiotic",
    displayName: "Antibiotic",
    type: "pharma",
    synthesizable: true,
    minPharmaRank: 1,
    synthesisDV: 13,
    synthesisMaterials: "everyday",
    priceCategory: "costly",
    costEb: 50,
    durationMs: 7 * 24 * 60 * 60 * 1000, // 1 week
    durationDisplay: "1 week",
    effects: "+2 HP per day for 1 week. Prevents infection.",
  },
  {
    name: "rapidetox",
    displayName: "Rapidetox",
    type: "pharma",
    synthesizable: true,
    minPharmaRank: 1,
    synthesisDV: 13,
    synthesisMaterials: "costly",
    priceCategory: "costly",
    costEb: 50,
    durationMs: 0,
    durationDisplay: "Instant",
    effects: "Instantly purges all drug effects from the system.",
  },
  {
    name: "speedheal",
    displayName: "Speedheal",
    type: "pharma",
    synthesizable: true,
    minPharmaRank: 2,
    synthesisDV: 15,
    synthesisMaterials: "costly",
    priceCategory: "expensive",
    costEb: 100,
    durationMs: 0,
    durationDisplay: "Instant",
    effects: "Heals BODY+WILL HP instantly. Can only be used once per day.",
  },
  {
    name: "stim",
    displayName: "Stim",
    type: "pharma",
    synthesizable: true,
    minPharmaRank: 2,
    synthesisDV: 15,
    synthesisMaterials: "costly",
    priceCategory: "costly",
    costEb: 50,
    durationMs: 60 * 60 * 1000, // 1 hour
    durationDisplay: "1 hour",
    effects: "Ignore Seriously Wounded penalties (-2 Actions, -6 MOVE) for 1 hour.",
  },
  {
    name: "surge",
    displayName: "Surge",
    type: "pharma",
    synthesizable: true,
    minPharmaRank: 2,
    synthesisDV: 15,
    synthesisMaterials: "costly",
    priceCategory: "costly",
    costEb: 50,
    durationMs: 24 * 60 * 60 * 1000, // 24 hours
    durationDisplay: "24 hours",
    effects: "Function normally without sleep for 24 hours. After: must sleep 12 hours.",
  },
  {
    name: "synthcoke",
    displayName: "Synthcoke",
    type: "pharma",
    synthesizable: true,
    minPharmaRank: 1,
    synthesisDV: 11,
    synthesisMaterials: "cheap",
    priceCategory: "everyday",
    costEb: 20,
    durationMs: 4 * 60 * 60 * 1000, // 4 hours
    durationDisplay: "4 hours",
    effects: "+1 REF for duration.",
    sideEffects: "After duration: -2 to all actions for 1 hour (crash).",
  },

  // ── Street Drugs ─────────────────────────────────────────────────────────
  {
    name: "bliss",
    displayName: "Bliss",
    type: "street",
    synthesizable: false,
    synthesisMaterials: "cheap",
    priceCategory: "everyday",
    costEb: 10,
    durationMs: 4 * 60 * 60 * 1000, // 4 hours
    durationDisplay: "4 hours",
    effects: "Powerful narcotic. All DEX, REF actions at -2. Pain insensitivity.",
    sideEffects: "Highly addictive. HL 1d6 per binge.",
    hl: 0,
  },
  {
    name: "dorph",
    displayName: "Dorph",
    type: "street",
    synthesizable: false,
    synthesisMaterials: "cheap",
    priceCategory: "everyday",
    costEb: 10,
    durationMs: 2 * 60 * 60 * 1000, // 2 hours
    durationDisplay: "2 hours",
    effects: "Endorphin booster. +1 to all actions. Ignores wound penalties for 1 round.",
    sideEffects: "Addictive. Crash: -1 to all actions for 4 hours after.",
  },
  {
    name: "black_lace",
    displayName: "Black Lace",
    type: "street",
    synthesizable: false,
    synthesisMaterials: "costly",
    priceCategory: "costly",
    costEb: 50,
    durationMs: 24 * 60 * 60 * 1000, // 24 hours
    durationDisplay: "24 hours",
    effects: "+2 REF, +2 BODY while active. Ignore pain penalties. Extremely aggressive.",
    sideEffects: "Extremely addictive. HL 2d6 per use. Avoiding secondary effect returns 2d6 Humanity Loss. May trigger cyberpsychosis-like behavior.",
    hl: 0,
  },
  {
    name: "jazz",
    displayName: "Jazz",
    type: "street",
    synthesizable: false,
    synthesisMaterials: "costly",
    priceCategory: "costly",
    costEb: 50,
    durationMs: 1 * 60 * 60 * 1000,
    durationDisplay: "1 hour",
    effects: "+1 to all REF checks. +1 Initiative. Heightened reflexes.",
    sideEffects: "Moderately addictive.",
  },

  // ── Combat Chemicals ─────────────────────────────────────────────────────
  {
    name: "boost",
    displayName: "Boost",
    type: "combat",
    synthesizable: true,
    minPharmaRank: 3,
    synthesisDV: 17,
    synthesisMaterials: "expensive",
    priceCategory: "expensive",
    costEb: 100,
    durationMs: 24 * 60 * 60 * 1000, // 24 hours
    durationDisplay: "24 hours",
    effects: "+2 INT for duration.",
    sideEffects: "After duration: Seriously Wounded penalties apply regardless of HP for 1 hour.",
  },
  {
    name: "smash",
    displayName: "Smash",
    type: "street",
    synthesizable: false,
    synthesisMaterials: "expensive",
    priceCategory: "expensive",
    costEb: 100,
    durationMs: 8 * 60 * 60 * 1000, // 8 hours
    durationDisplay: "8 hours",
    effects: "+2 to Performance, Conversation, Persuasion, Acting, Dance checks. Social euphoric.",
    sideEffects: "Highly addictive. Crash causes mood crash and mild depression.",
  },
  {
    name: "blue_glass",
    displayName: "Blue Glass",
    type: "street",
    synthesizable: false,
    synthesisMaterials: "costly",
    priceCategory: "everyday",
    costEb: 20,
    durationMs: 0, // duration varies; narrative effect only
    durationDisplay: "Varies",
    effects: "User experiences vivid hallucinations (narrative effect, no stat modifier).",
    sideEffects: "Disorienting. May cause panic or euphoria depending on set and setting.",
  },
];

export const getDrug = (name: string): IDrugDef | undefined =>
  DRUGS.find((d) => d.name === name.toLowerCase().replace(/[\s\-]/g, "_"));

export const synthesisDrugs = (): IDrugDef[] =>
  DRUGS.filter((d) => d.synthesizable);

export const streetDrugs = (): IDrugDef[] =>
  DRUGS.filter((d) => d.type === "street");

export const drugByRank = (rank: number): IDrugDef[] =>
  DRUGS.filter((d) => d.synthesizable && (d.minPharmaRank ?? 0) <= rank);
