/** Power Sensing and Masking (Unisystem supplement, Chapter 8).
 * Sensing reveals impressions, not sheets. Masking hides signatures. */
import { successLevels } from "./rules.ts";
import type { ICinChar } from "./types.ts";

/** slug -> Power Signature label. Unmapped purchases stay private. */
const SIGNATURES: Record<string, string> = {
  "vampire": "Vampire",
  "master-vampire": "Master Vampire",
  "werewolf": "Lycanthrope",
  "alpha-i": "Alpha",
  "alpha-ii": "Alpha",
  "alpha-iii": "Alpha",
  "animator": "Animator",
  "necromancer": "Necromancer",
  "sorcery": "Sorcery",
  "spirit-medium": "Spirit",
  "telepathy": "Telepathy",
  "animal-to-call": "Animal to Call",
  "human-servant-bond": "Human Servant",
  "pack-bond": "Pack Bond",
  "dream-walker": "Spirit",
};

/** Derive a character's Power Signatures from purchases. */
export function powerSignatures(c: ICinChar): string[] {
  const out = new Set<string>();
  for (const e of c.qualities) {
    const label = SIGNATURES[e.slug];
    if (label) out.add(label);
  }
  if (["telekinesis-p", "empathy", "clairvoyance", "precognition",
    "psychometry-p"].some((s) =>
      c.qualities.some((e) => e.slug === s)
    )) {
    out.add("Psychic");
  }
  return [...out];
}

export function maskLevel(c: ICinChar): number {
  const e = c.qualities.find((x) => x.slug === "mask");
  return e?.level ?? 0;
}

export function hasPower(c: ICinChar, slug: string): boolean {
  return c.qualities.some((e) => e.slug === slug);
}

export type Reveal = "surface" | "partial" | "full";

/** Contest verdict: sensor total vs masked target total.
 * Ties go to the masked target (spec). */
export function maskVerdict(
  sensor: number,
  target: number,
): Reveal {
  if (sensor <= target) return "surface";
  if (sensor - target <= 2) return "partial";
  return "full";
}

export function d10(): number {
  return 1 + Math.floor(Math.random() * 10);
}

export interface SenseResult {
  sl: number;
  masked: boolean;
  verdict: Reveal;
  signatures: string[];
  impression: string;
  message: string;
}

/** Active sensing: Perception + Notice + d10 vs Willpower + Mask + d10. */
export function resolveSense(
  sensor: ICinChar,
  target: ICinChar,
  sensorRoll: number,
  targetRoll: number,
): SenseResult {
  const sigs = powerSignatures(target);
  const masked = target.mask.active && maskLevel(target) > 0;
  const st = (sensor.attrs.perception ?? 0) +
    (sensor.skills.notice ?? 0) + sensorRoll;
  const base = {
    sl: successLevels(st),
    masked,
    signatures: sigs,
    impression: target.mask.impression,
  };
  if (!masked) {
    if (sigs.length === 0) {
      return {
        ...base,
        verdict: "full",
        message:
          "No supernatural presence — this reads as an ordinary mortal.",
      };
    }
    return {
      ...base,
      verdict: "full",
      message: `Signature: ${sigs.join("; ")}.`,
    };
  }
  const tt = (target.attrs.willpower ?? 0) + maskLevel(target) +
    targetRoll;
  const verdict = maskVerdict(st, tt);
  if (verdict === "surface") {
    return {
      ...base,
      verdict,
      message:
        "Nothing beyond the apparent mortal aura." +
        (base.impression ? ` Surface: ${base.impression}.` : ""),
    };
  }
  if (verdict === "partial") {
    return {
      ...base,
      verdict,
      message:
        "The harmless aura is inconsistent — it conceals greater" +
        " power." +
        (base.impression ? ` Surface: ${base.impression}.` : ""),
    };
  }
  return {
    ...base,
    verdict,
    message:
      `Signature: ${sigs.join("; ")}.` +
      (base.impression ? ` Surface: ${base.impression}.` : ""),
  };
}
