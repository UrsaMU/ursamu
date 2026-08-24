/**
 * Cyberpunk RED — Armor Catalog and Layering Rules
 */
import type { PriceCategory } from "../db/schemas.ts";

export interface IArmorDef {
  name: string;
  sp: number;          // Stopping Power
  penalty: number;     // REF/DEX/MOVE penalty (negative number or 0)
  locations: ("body" | "head")[];
  concealable: boolean;
  priceCategory: PriceCategory;
  costEb: number;
  description: string;
}

export const ARMOR_CATALOG: IArmorDef[] = [
  // ── Body Armor ──────────────────────────────────────────────────────────
  {
    name: "leather_jacket",
    sp: 4,
    penalty: 0,
    locations: ["body"],
    concealable: true,
    priceCategory: "everyday",
    costEb: 20,
    description: "Treated leather jacket. Light protection, fully concealable.",
  },
  {
    name: "kevlar_t_shirt",
    sp: 7,
    penalty: 0,
    locations: ["body"],
    concealable: true,
    priceCategory: "costly",
    costEb: 50,
    description: "Woven kevlar undershirt. Invisible under clothing.",
  },
  {
    name: "light_armorjack",
    sp: 11,
    penalty: 0,
    locations: ["body"],
    concealable: false,
    priceCategory: "costly",
    costEb: 100,
    description: "Lightweight tactical body armor. Visible but comfortable.",
  },
  {
    name: "medium_armorjack",
    sp: 12,
    // penalty: REF/DEX/MOVE penalty (negative number or 0)
    penalty: -2,
    locations: ["body"],
    concealable: false,
    priceCategory: "costly",
    costEb: 500,
    description: "Standard military-grade body armor. -2 REF/DEX/MOVE.",
  },
  {
    name: "heavy_armorjack",
    sp: 13,
    // penalty: REF/DEX/MOVE penalty (negative number or 0)
    penalty: -2,
    locations: ["body"],
    concealable: false,
    priceCategory: "expensive",
    costEb: 1000,
    description: "Full tactical body armor. -2 REF/DEX/MOVE.",
  },
  {
    name: "flak",
    sp: 15,
    // penalty: REF/DEX/MOVE penalty (negative number or 0)
    penalty: -4,
    locations: ["body"],
    concealable: false,
    priceCategory: "costly",
    costEb: 500,
    description: "Military flak armor. -4 REF/DEX/MOVE.",
  },
  {
    // Bodyweight Suit covers body AND head, each location SP 11, penalty 0
    name: "body_weight_suit",
    sp: 11,
    // penalty: REF/DEX/MOVE penalty (negative number or 0)
    penalty: 0,
    locations: ["body", "head"],
    concealable: false,
    priceCategory: "very_expensive",
    costEb: 5000,
    description: "Full-body subdermal-weave suit. SP 11 at each covered location, no movement penalty.",
  },
  {
    name: "metalgear",
    sp: 18,
    // penalty: REF/DEX/MOVE penalty (negative number or 0)
    penalty: -4,
    locations: ["body"],
    concealable: false,
    priceCategory: "very_expensive",
    costEb: 10000,
    description: "Full combat exosuit shell. Near-military grade. -4 REF/DEX/MOVE.",
  },

  // ── Head Armor ──────────────────────────────────────────────────────────
  {
    name: "helmet",
    sp: 11,
    penalty: 0,
    locations: ["head"],
    concealable: false,
    priceCategory: "costly",
    costEb: 100,
    description: "Standard ballistic helmet.",
  },
  {
    name: "light_helmet",
    sp: 7,
    penalty: 0,
    locations: ["head"],
    concealable: true,
    priceCategory: "everyday",
    costEb: 20,
    description: "Lightweight cap with SP 7 hardened panels.",
  },

  // ── Shields ─────────────────────────────────────────────────────────────
  {
    name: "bulletproof_shield",
    sp: 10,
    penalty: 0,
    locations: ["body"],
    concealable: false,
    priceCategory: "expensive",
    costEb: 100,
    description: "Portable ballistic shield. Covers one side while held.",
  },
];

export const getArmor = (name: string): IArmorDef | undefined =>
  ARMOR_CATALOG.find((a) => a.name === name.toLowerCase().replace(/[\s\-]/g, "_"));

/**
 * Armor does NOT stack — use the highest SP for each location.
 * Cyberware (subdermal armor SP 11) is treated like worn armor for this rule.
 */
export const effectiveSP = (armorSp: number, cyberwareSp: number): number =>
  Math.max(armorSp, cyberwareSp);

/**
 * After a hit penetrates armor, ablate SP by 1.
 * Returns new SP value (minimum 0).
 */
export const ablateArmor = (currentSp: number): number =>
  Math.max(0, currentSp - 1);

/**
 * Armor penalty from a piece of armor (as a negative number to apply to REF/DEX/MOVE).
 * The penalty from worn armor and cyberware do NOT stack — use the worse penalty.
 */
export const effectivePenalty = (penalties: number[]): number =>
  Math.min(0, Math.min(...penalties));
