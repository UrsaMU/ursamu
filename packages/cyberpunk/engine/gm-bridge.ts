/**
 * Cyberpunk RED -- ai-gm Bridge Registration
 *
 * Emits gm:system:register so a running ai-gm instance picks up CPR RED as a
 * game system at runtime. No import of ai-gm is needed -- all coupling is via
 * gameHooks.emit() as never.
 *
 * Call registerWithGM() once from plugin init(). It is idempotent.
 */
import { gameHooks } from "@ursamu/mush";

// --- CPR RED system prompt ----------------------------------------------------

const CORE_RULES_PROMPT = `\
CYBERPUNK RED -- GAME MASTER CONTEXT (Core Rulebook v1.25)

SETTING
Night City, 2045. Megacorporations own the sky, the streets, and the flesh of
everyone in them. Violence is a commodity. Chrome replaces meat. Loyalty is
negotiated. The city eats people and calls it opportunity.

TONE
Gritty, noir, visceral. Consequences matter -- every win costs something. NPCs
have motives, survival instincts, and competing loyalties. Narrate what it
looks, sounds, and smells like before describing what it costs. Fiction first.

WOUND STATE VOCABULARY
When you see these keywords in round output, adjust narrative intensity:
  HEALTHY         -- Character fully functional.
  LIGHTLY WOUNDED -- -2 to all actions. Bleeding, gritting teeth, still moving.
  SERIOUSLY WOUNDED -- -4 to all actions. Urgent medical need. Describe pain.
  MORTALLY WOUNDED -- Death saves required each round. Describe desperation.
  DEAD            -- Narrate consequences for survivors; do not linger on the corpse.
A SERIOUSLY WOUNDED character continuing to fight is both heroic and horrifying.
Mark it.

DICE / ROLL FORMAT
CPR uses STAT + Skill + 1d10 vs a fixed Difficulty Value (DV).
  [CRIT!]   -- Natural 10 + bonus die. Exceptional outcome -- go big.
  [FUMBLE!] -- Natural 1 minus penalty die. Catastrophic failure -- make it sting.
  SUCCESS   -- Roll total >= DV. Narrate it happening.
  FAILURE   -- Roll total < DV. Narrate consequences, not just "you miss."
Typical DVs: Easy 9 · Everyday 13 · Difficult 15 · Very Difficult 17 ·
             Incredibly Difficult 21 · Nearly Impossible 24.

COMBAT (Friday Night Firefight)
  - Attacks: total vs defender DV. Hit lands net damage (raw minus armor SP).
  - Armor ablates: stopping power (SP) drops by 1 per hit.
  - Called shots: -8 penalty, location-specific effects (arm/leg/hand/eye).
  - Autofire burst: +2 to attack, sprays fire over an area.
  - Brawling: grab -> pin/choke/throw chains. Brutal and final.
  - Initiative order: REF + 1d10 + modifiers, descending.
When a hit lands, describe the impact -- the sound, the snap, the spray.

NETRUNNING
Netrunners jack in while their body sits vulnerable. The NET is rendered space:
architecture floors with passwords, ICE, file caches, and control nodes.
  - ICE attacks damage the Netrunner's physical body.
  - Black ICE can kill outright.
  - Multi-runner sessions allow parallel assault.
The NET is abstract and cold; the runner's body is meat in a chair.

CYBERWARE & HUMANITY
Installing cyberware reduces Humanity (HL) and lowers EMP stat.
  - EMP = EMP_base - floor(HL / 10)
  - At EMP 0: cyberpsychosis -- uncontrolled killing, involuntary hospitalization.
  - Humanity regained through: connection (2d6), achievement (1d6+2),
    kindness (1d6), memory (1d3). 24-hour cooldown.
A humanity gain event is rare and significant. Acknowledge it as character growth.

ECONOMY
  - Currency: Eurodollars (EB)
  - Lifestyle tiers: Kibble -> Street -> Low -> Medium -> High -> Luxury
  - Reputation (1-10): determines NPC deference, gang attention, corporate scrutiny
  - Night Markets (Fixer rank 5+) and Midnight Markets (rank 9+) for black-market goods
  - Jobs board: low (courier) through extreme (corporate black site)

JOBS & SCAVENGING
  - Jobs reward EB on completion. Danger level affects NPC opposition and narrative stakes.
  - Scavenging zones: quarantine zones yield high loot but carry extreme ambush risk.
  - When a job resolves, consider who commissioned it and what they wanted hidden.

NPC VOICE ARCHETYPES
When speaking as an NPC, match their archetype:
  Fixer / Operator     Clipped, transactional. Every sentence is a deal.
                       "I can make that happen. For a price."
  Corporate Exec       Cold, precise, condescending. Threat is always implicit.
                       "We've reviewed your file. You've been... useful."
  Street Ganger        Aggressive, posturing. Looks for any sign of weakness.
                       "You lost, choom. Walk away while you still can."
  Netrunner            Paranoid, distracted. Speaks in system metaphors.
                       "The architecture here is sloppy. Someone will notice."
  Trauma Team Medic    Professional, fast, merciless efficiency. Time is product.
                       "Stabilized. Bill goes to whoever called us in."
  Nomad               Direct, community-first, skeptical of city people.
                       "We take care of our own. You're not our own yet."
  Ripperdoc            World-weary. Has seen everything, charged for most of it.
                       "I've patched worse. Lay down. Don't scream."

ADJUDICATION PRINCIPLE
Fiction first. Mechanics confirm what the fiction already implies.
Narrate what it looks, sounds, and smells like before what it costs.
When in doubt: make the world feel real and dangerous.`;

// --- Hard / Soft GM moves -----------------------------------------------------

const HARD_MOVES = [
  "Escalate corporate response -- suits arrive with full security package",
  "Gang retaliation -- the body count attracts notice",
  "Cyberpsychosis episode -- someone's chrome glitches at the worst moment",
  "ICE counterattack -- the architecture bites back",
  "Lifestyle default -- the bills come due, the landlord sends collectors",
  "Ambush -- they were waiting for this",
  "Informant burns the crew -- someone talked",
  "Critical injury consequence -- the wound catches up",
];

const SOFT_MOVES = [
  "Put a complication between them and the goal",
  "Show the cost of a previous choice",
  "An NPC acts on their own interests",
  "Hint at something worse coming",
  "Reveal an unexpected alliance or betrayal",
  "Make the environment hostile: rain, gangs, surveillance, debris",
  "Put someone they care about in danger",
];

// --- System registration payload ---------------------------------------------

const CPR_STATS = [
  "INT", "REF", "DEX", "TECH", "COOL",
  "WILL", "LUCK", "MOVE", "BODY", "EMP",
] as const;

/** Full IGameSystem-shaped payload for ai-gm (no ai-gm import). */
const CPR_SYSTEM = {
  id: "cyberpunk-red",
  name: "Cyberpunk RED",
  version: "1.25",
  source: "ingested" as const,
  ingestedFrom: ["@ursamu/cyberpunk-plugin"],
  confidence: { coreRules: "high" as const },

  coreRulesPrompt: CORE_RULES_PROMPT,

  // DV checks are variable; these are Everyday/Easy reference points
  moveThresholds: { fullSuccess: 15, partialSuccess: 13 },

  stats: CPR_STATS,
  categories: ["Core Stats"] as const,
  statsByCategory: {
    "Core Stats": [...CPR_STATS],
  },

  // Inline player sheets live on dbojs player objects (data.cpr)
  charCollection: "cpr.players",

  getCategories: () => ["Core Stats"],
  getStats: (cat?: string) =>
    !cat || cat === "Core Stats" ? [...CPR_STATS] : [],
  getStat: (actor: Record<string, unknown>, stat: string) => {
    const key = stat.toLowerCase();
    const stats = (actor.stats ?? actor.data ?? {}) as Record<
      string,
      unknown
    >;
    return stats[key] ?? actor[key] ?? 0;
  },
  setStat: async (
    actor: Record<string, unknown>,
    stat: string,
    value: unknown,
  ) => {
    const key = stat.toLowerCase();
    if (!actor.stats || typeof actor.stats !== "object") {
      actor.stats = {};
    }
    (actor.stats as Record<string, unknown>)[key] = value;
    await Promise.resolve();
  },
  validate: (stat: string, value: unknown) => {
    if (!CPR_STATS.map((s) => s.toLowerCase()).includes(
      stat.toLowerCase(),
    )) {
      return false;
    }
    return typeof value === "number" && value >= 1 && value <= 10;
  },

  formatMoveResult(
    moveName: string,
    stat: string,
    total: number,
    roll: [number, number],
  ): string {
    const d10 = roll[0] || roll[1] || 0;
    const tag = d10 === 10
      ? " [CRIT!]"
      : d10 === 1
      ? " [FUMBLE!]"
      : "";
    return (
      `CPR check: ${moveName} (${stat}) total ${total}` +
      `${tag} — compare to DV`
    );
  },

  formatCharacterContext(sheet: {
    name?: string;
    playbook?: string;
    data?: Record<string, unknown>;
  }): string {
    const d = sheet.data ?? {};
    const stats = (d.stats ?? {}) as Record<string, number>;
    const role = String(sheet.playbook ?? d.role ?? "?");
    const wound = String(d.woundState ?? "healthy");
    const hp = d.hp as { current?: number; max?: number } | undefined;
    const lines = [
      `CHARACTER: ${sheet.name ?? "Unknown"} (${role})`,
      `  STATs: INT ${stats.int ?? "?"} REF ${stats.ref ?? "?"} ` +
      `DEX ${stats.dex ?? "?"} TECH ${stats.tech ?? "?"} ` +
      `COOL ${stats.cool ?? "?"}`,
      `  WILL ${stats.will ?? "?"} LUCK ${stats.luck ?? "?"} ` +
      `MOVE ${stats.move ?? "?"} BODY ${stats.body ?? "?"} ` +
      `EMP ${stats.emp ?? "?"}`,
      `  HP ${hp?.current ?? "?"}/${hp?.max ?? "?"}  ` +
      `Wound: ${wound}`,
    ];
    if (d.eurodollars != null) {
      lines.push(`  EB: ${d.eurodollars}`);
    }
    return lines.join("\n");
  },

  adjudicationHint:
    "Fiction first -- mechanics confirm what the fiction implies. " +
    "Narrate impact, blood, and consequence. Night City is brutal " +
    "and beautiful. This is Cyberpunk RED (2045), not 2020 or " +
    "Edgerunners anime continuity unless the table says so. " +
    "NEVER pose for player characters — only the world and NPCs.",

  hardMoves: HARD_MOVES,
  softMoves: SOFT_MOVES,

  missConsequenceHint:
    "A failed CPR check is rarely just a miss -- open the door " +
    "for a soft or hard move. Make Night City bite back.",
};

// --- Dynamic event subscriptions for ai-gm -----------------------------------
// Listed events must emit ICPRGMPayload (roomId, playerId, playerName, summary).

const CPR_GM_EVENTS = [
  { name: "cpr:roll",            cue: "CPR skill check result" },
  { name: "cpr:attack:hit",      cue: "CPR attack landed" },
  { name: "cpr:brawl:resolved",  cue: "CPR brawl move" },
  { name: "cpr:rest:completed",  cue: "CPR rest completed" },
  { name: "cpr:humanity:gained", cue: "CPR humanity regained" },
];

// --- Registration function ----------------------------------------------------

/**
 * Emit gm:system:register to register CPR RED with a running ai-gm instance.
 * Safe to call multiple times (idempotent on ai-gm's side).
 * Call once from the CPR plugin's init().
 */
export function registerWithGM(): void {
  gameHooks.emit("gm:system:register" as never, {
    system: CPR_SYSTEM,
    events: CPR_GM_EVENTS,
  } as never);
  console.log("[cpr] Registered with ai-gm as system 'cyberpunk-red'.");
}
