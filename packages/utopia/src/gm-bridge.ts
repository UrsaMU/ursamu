import { DBO, gameHooks } from "@ursamu/mush";
import "./hooks-augment.ts";

const CORE = `UTOPIA — GM CONTEXT
Week loop: Newsfeed, then one plan, then Sphere.
Difficulty is 2d10 + danger d6s. DV locks for the week.
Players may buy a hitch if danger is 4 or lower.
Engine owns danger, resources, reputation, DV.
Narrate the outcome. Do not change numbers.
Never pose for player characters.
Tone: neo-future after The Fall. Hope and inequality.
The city is the judge, not a companion.`;

export const UTOPIA_GM_EVENTS = [
  { name: "utopia:roll", cue: "UTOPIA ROLL" },
  { name: "utopia:feed:ticked", cue: "UTOPIA FEED" },
] as const;

export function utopiaSystemRecord() {
  return {
    id: "utopia",
    name: "Utopia",
    version: "0.1.0",
    source: "ingested" as const,
    ingestedFrom: ["@ursamu/utopia"],
    confidence: { coreRules: "high" as const },
    coreRulesPrompt: CORE,
    moveThresholds: { fullSuccess: 1, partialSuccess: 0 },
    stats: ["Danger", "Resources", "Bravado"],
    adjudicationHint:
      "Judge the week plan, not every sentence. Engine already rolled.",
    hardMoves: [
      "Raise danger",
      "A story on the feed gets worse",
    ],
    softMoves: [
      "Offer a hitch",
      "Introduce a contact",
    ],
    missConsequenceHint: "The week will not give them this.",
    categories: ["Status"],
    statsByCategory: {
      Status: ["Danger", "Resources", "Bravado"],
    },
    charCollection: "utopia.chars",
    events: [...UTOPIA_GM_EVENTS],
  };
}

async function persistSystem(): Promise<void> {
  const rec = utopiaSystemRecord();
  const stored = {
    id: rec.id,
    name: rec.name,
    version: rec.version,
    source: rec.source,
    ingestedFrom: rec.ingestedFrom,
    confidence: rec.confidence,
    coreRulesPrompt: rec.coreRulesPrompt,
    moveThresholds: rec.moveThresholds,
    stats: rec.stats,
    adjudicationHint: rec.adjudicationHint,
    hardMoves: rec.hardMoves,
    softMoves: rec.softMoves,
    missConsequenceHint: rec.missConsequenceHint,
    categories: rec.categories,
    statsByCategory: rec.statsByCategory,
    charCollection: rec.charCollection,
  };
  const col = new DBO<typeof stored>("server.gm.custom_systems");
  const existing = await col.findOne({ id: rec.id });
  if (existing) await col.update({ id: rec.id }, stored);
  else await col.create(stored);
}

export async function registerWithGM(): Promise<void> {
  try {
    await persistSystem();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[utopia] persist GM system:", msg);
  }
  // deno-lint-ignore no-explicit-any
  const hooks = gameHooks as any;
  if (typeof hooks.emit !== "function") return;
  await hooks.emit("gm:system:register", {
    system: utopiaSystemRecord(),
    events: UTOPIA_GM_EVENTS,
  });
}
