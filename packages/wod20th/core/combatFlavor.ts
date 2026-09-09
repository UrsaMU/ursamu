// core/combatFlavor.ts -- Combat narration from data/combat-flavor.json.
//
// Zero builder setup. Mode (brawl/melee/claws/...) picks verbs; the weapon
// display name is inserted automatically when present.

import flavorJson from "../data/combat-flavor.json" with { type: "json" };

export type AttackMode =
  | "brawl"
  | "melee"
  | "firearms"
  | "claws"
  | "bite"
  | "psychic"
  | "weapon";

export type StrikeOutcome = "hit" | "miss" | "botch" | "defended";

export interface VerbPair {
  v1: string;
  v3: string;
}

export interface FlavorOpts {
  mode: AttackMode;
  form?: string;
  attackerName: string;
  defenderName: string;
  weaponName?: string;
  silver?: boolean;
  dmg: number;
  dtype: string;
  outcome: StrikeOutcome;
  defenseKind?: "dodge" | "block" | "parry" | string;
  rng?: () => number;
}

export interface StrikeLines {
  verb: VerbPair;
  attacker: string;
  defender: string;
  room: string;
}

type Rng = () => number;

interface FlavorFile {
  modes: Record<string, { verbs: VerbPair[] }>;
  hit: { heavy: string[]; solid: string[]; glance: string[] };
  miss: string[];
  botch: string[];
  impact: {
    heavy: string[];
    solid: string[];
    glance: string[];
    none: string[];
  };
}

const DATA = flavorJson as FlavorFile;

function pick<T>(arr: readonly T[], rng: Rng): T {
  if (!arr.length) throw new Error("combatFlavor: empty table");
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}

function isWar(form?: string): boolean {
  const f = (form ?? "homid").toLowerCase();
  return f === "crinos" || f === "hispo";
}

function modeKey(mode: AttackMode, form?: string): string {
  const m = mode === "weapon" ? "melee" : mode;
  if (m === "claws") {
    const f = (form ?? "homid").toLowerCase();
    if (isWar(f)) return "clawsWar";
    if (f === "lupus") return "clawsLupus";
    return "clawsGlabro";
  }
  if (m === "brawl" && isWar(form)) return "brawlWar";
  return m;
}

export function pickVerb(
  mode: AttackMode,
  form?: string,
  rng: Rng = Math.random,
): VerbPair {
  const key = modeKey(mode, form);
  const block = DATA.modes[key] ?? DATA.modes.brawl;
  const verbs = block?.verbs ?? [{ v1: "strike", v3: "strikes" }];
  return pick(verbs, rng);
}

function fluid(dtype: string): string {
  if (dtype === "A") return "ichor";
  if (dtype === "L") return "blood";
  return "bruising";
}

function defV3(kind?: string): string {
  if (kind === "parry") return "parries";
  if (kind === "block") return "blocks";
  return "sidesteps";
}

function defV1(kind?: string): string {
  if (kind === "parry") return "parry";
  if (kind === "block") return "block";
  return "twist aside from";
}

function hitTier(dmg: number): "heavy" | "solid" | "glance" {
  if (dmg >= 5) return "heavy";
  if (dmg >= 3) return "solid";
  return "glance";
}

function hitTail(dmg: number, dtype: string, rng: Rng): string {
  if (dmg <= 0) return "";
  const tier = hitTier(dmg);
  const raw = pick(DATA.hit[tier], rng)
    .replaceAll("{fluid}", fluid(dtype))
    .replaceAll("{dmg}", String(dmg))
    .replaceAll("{dtype}", dtype);
  return ` -- ${raw} (%cr${dmg} ${dtype}%cn)`;
}

function impactLine(dmg: number, dtype: string, rng: Rng): string {
  if (dmg <= 0) return pick(DATA.impact.none, rng);
  const tier = hitTier(dmg);
  return pick(DATA.impact[tier], rng)
    .replaceAll("{dmg}", String(dmg))
    .replaceAll("{dtype}", dtype)
    .replaceAll("{fluid}", fluid(dtype));
}

/** "with the silver sword" / empty when unarmed. */
function withWeapon(name?: string, silver?: boolean): string {
  if (!name) return "";
  const n = name.trim();
  if (!n) return "";
  const sp = silver && !/\bsilver\b/i.test(n) ? "silver " : "";
  return ` with the ${sp}${n}`;
}

export function narrateStrike(opts: FlavorOpts): StrikeLines {
  const rng = opts.rng ?? Math.random;
  const verb = pickVerb(opts.mode, opts.form, rng);
  const w = withWeapon(opts.weaponName, opts.silver);
  const { attackerName: A, defenderName: D } = opts;
  const tail = hitTail(opts.dmg, opts.dtype, rng);

  if (opts.outcome === "botch") {
    const m = pick(DATA.botch, rng);
    return {
      verb,
      attacker: `%cyYou ${verb.v1} ${D}${w}, ${m}.%cn`,
      defender: `%cy${A} ${verb.v3} you${w}, ${m}.%cn`,
      room: `%cy${A} ${verb.v3} ${D}${w}, ${m}.%cn`,
    };
  }
  if (opts.outcome === "defended") {
    return {
      verb,
      attacker:
        `%cyYou ${verb.v1} ${D}${w}, but ${D} ${defV3(opts.defenseKind)} ` +
        `the strike.%cn`,
      defender: `%cgYou ${defV1(opts.defenseKind)} ${A}'s strike.%cn`,
      room:
        `%cy${A} ${verb.v3} ${D}${w}, who ${defV3(opts.defenseKind)} ` +
        `the strike.%cn`,
    };
  }
  if (opts.outcome === "miss") {
    const m = pick(DATA.miss, rng);
    return {
      verb,
      attacker: `%cyYou ${verb.v1} ${D}${w}, ${m}.%cn`,
      defender: `%cy${A} ${verb.v3} you${w}, ${m}.%cn`,
      room: `%cy${A} ${verb.v3} ${D}${w}, ${m}.%cn`,
    };
  }

  const open = `%cy${A} ${verb.v3} you${w}.%cn`;
  const room = opts.defenseKind
    ? `%cy${A} ${verb.v3} ${D}${w}, who ${defV3(opts.defenseKind)} ` +
      `but takes %cr${opts.dmg} ${opts.dtype}%cn%cy.%cn`
    : `%cy${A} ${verb.v3} ${D}${w}${tail}.%cn`;

  return {
    verb,
    attacker: `%cyYou ${verb.v1} ${D}${w}${tail}.%cn`,
    defender: `${open}%r  ${impactLine(opts.dmg, opts.dtype, rng)}`,
    room,
  };
}

export function npcStrikeClause(opts: {
  mode: AttackMode;
  defenderName: string;
  dmg: number;
  dtype: string;
  form?: string;
  rng?: Rng;
}): string {
  const rng = opts.rng ?? Math.random;
  const verb = pickVerb(opts.mode, opts.form, rng);
  const base = `${verb.v3} ${opts.defenderName}`;
  if (opts.dmg <= 0) return `${base}, ${pick(DATA.miss, rng)}`;
  return `${base}${hitTail(opts.dmg, opts.dtype, rng)}`;
}

export function modeFromSwitch(sw: string): AttackMode {
  if (sw === "melee" || sw === "firearms" || sw === "claws") return sw;
  return "brawl";
}

export function modeFromNpc(
  mode: "claws" | "bite" | "weapon" | "psychic",
): AttackMode {
  return mode === "weapon" ? "melee" : mode;
}
