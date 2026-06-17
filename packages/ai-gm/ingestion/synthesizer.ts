// ─── Ingestion Synthesizer ────────────────────────────────────────────────────
//
// Merges IChunkExtraction[] from all books into a single IGameSystemDraft,
// reconciles conflicts, and produces IUncertainItem[] for admin review.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  IChunkExtraction,
  IGameSystemDraft,
  IUncertainItem,
} from "./schema.ts";
import { nanoid } from "./util.ts";

// ─── Public API ───────────────────────────────────────────────────────────────

export async function synthesize(
  model: ChatGoogleGenerativeAI,
  extractions: IChunkExtraction[],
): Promise<{ draft: IGameSystemDraft; uncertainItems: IUncertainItem[] }> {
  const merged = mergeExtractions(extractions);
  const uncertain = findConflicts(extractions, merged);

  // Ask the LLM to write the narrative sections from the merged data
  const narrativeSections = await generateNarrativeSections(model, extractions);

  const draft: IGameSystemDraft = {
    gameName: merged.gameName ?? "Unknown System",
    version: "1.0.0",
    stats: merged.stats,
    categories: merged.categories,
    statsByCategory: merged.statsByCategory,
    moveThresholds: {
      fullSuccess: merged.moveThresholds?.fullSuccess ?? 10,
      partialSuccess: merged.moveThresholds?.partialSuccess ?? 7,
    },
    hardMoves: merged.hardMoves,
    softMoves: merged.softMoves,
    coreRulesPrompt: narrativeSections.coreRulesPrompt,
    adjudicationHint: narrativeSections.adjudicationHint,
    missConsequenceHint: narrativeSections.missConsequenceHint,
    tone: merged.tone ?? "Unknown",
  };

  return { draft, uncertainItems: uncertain };
}

// ─── Merge extractions (vote on each field) ───────────────────────────────────

export interface MergedData {
  gameName?: string;
  stats: string[];
  categories: string[];
  statsByCategory: Record<string, string[]>;
  moveThresholds?: { fullSuccess?: number; partialSuccess?: number };
  hardMoves: string[];
  softMoves: string[];
  tone?: string;
}

export function mergeExtractions(extractions: IChunkExtraction[]): MergedData {
  const gameNames = extractions.flatMap((e) => e.gameName ? [e.gameName] : []);
  const allStats = extractions.flatMap((e) => e.stats ?? []);
  const allCategories = extractions.flatMap((e) => e.categories ?? []);
  const allHardMoves = extractions.flatMap((e) => e.hardMoves ?? []);
  const allSoftMoves = extractions.flatMap((e) => e.softMoves ?? []);
  const tones = extractions.flatMap((e) => e.tone ? [e.tone] : []);

  // Merge statsByCategory — union across all extractions
  const statsByCategory: Record<string, string[]> = {};
  for (const e of extractions) {
    for (const [cat, stats] of Object.entries(e.statsByCategory ?? {})) {
      statsByCategory[cat] = unique([
        ...(statsByCategory[cat] ?? []),
        ...stats,
      ]);
    }
  }

  // Move thresholds — pick most-mentioned values
  const fullSuccessVotes = extractions
    .map((e) => e.moveThresholds?.fullSuccess)
    .filter((v): v is number => v !== undefined);
  const partialSuccessVotes = extractions
    .map((e) => e.moveThresholds?.partialSuccess)
    .filter((v): v is number => v !== undefined);

  return {
    gameName: mostCommon(gameNames),
    stats: unique(allStats),
    categories: unique(allCategories),
    statsByCategory,
    moveThresholds: {
      fullSuccess: mostCommon(fullSuccessVotes),
      partialSuccess: mostCommon(partialSuccessVotes),
    },
    hardMoves: unique(allHardMoves).slice(0, 20),
    softMoves: unique(allSoftMoves).slice(0, 12),
    tone: tones[0],
  };
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export function findConflicts(
  extractions: IChunkExtraction[],
  _merged: MergedData,
): IUncertainItem[] {
  const items: IUncertainItem[] = [];

  // Check for conflicting move thresholds
  const fullSuccessValues = [
    ...new Set(
      extractions
        .map((e) => e.moveThresholds?.fullSuccess)
        .filter((v): v is number => v !== undefined),
    ),
  ];
  if (fullSuccessValues.length > 1) {
    items.push({
      id: nanoid(),
      field: "moveThresholds.fullSuccess",
      foundValues: fullSuccessValues.map(String),
      sources: extractions
        .filter((e) => e.moveThresholds?.fullSuccess !== undefined)
        .map((e) => e.sourceFile),
      gmSuggestion: `I found ${
        fullSuccessValues.join(" and ")
      } as thresholds for full success. The most common in PbtA games is 10+. I recommend ${
        Math.max(...fullSuccessValues)
      }.`,
      resolved: false,
    });
  }

  // Check for uncertain extractions with low-confidence stats
  const uncertainStats = extractions.filter(
    (e) => e.confidence === "uncertain" && e.stats && e.stats.length > 0,
  );
  if (
    uncertainStats.length > 0 &&
    extractions.filter((e) => e.confidence === "high" && e.stats?.length)
        .length === 0
  ) {
    const foundStats = unique(uncertainStats.flatMap((e) => e.stats ?? []));
    items.push({
      id: nanoid(),
      field: "stats",
      foundValues: foundStats,
      sources: [...new Set(uncertainStats.map((e) => e.sourceFile))],
      gmSuggestion: `I found these stats but wasn't certain: ${
        foundStats.join(", ")
      }. Please confirm these are the correct character stats for this game.`,
      resolved: false,
    });
  }

  return items;
}

// ─── Generate narrative sections via LLM ─────────────────────────────────────

const NARRATIVE_SYSTEM =
  `You are a game master AI assistant. Given extractions from a game book,
write three concise narrative sections for use in your system prompt:

1. coreRulesPrompt: A dense summary of the core rules for running the game (300-500 words).
   Include move thresholds, key mechanics, and fiction-first principles.

2. adjudicationHint: A single paragraph (2-3 sentences) reminding the GM when and how
   to trigger moves, apply consequences, and stay fiction-first.

3. missConsequenceHint: A single paragraph (1-2 sentences) describing what a miss means
   in this game and how hard the GM should be.

Respond with ONLY valid JSON matching this schema:
{
  "coreRulesPrompt": "...",
  "adjudicationHint": "...",
  "missConsequenceHint": "..."
}`;

async function generateNarrativeSections(
  model: ChatGoogleGenerativeAI,
  extractions: IChunkExtraction[],
): Promise<
  {
    coreRulesPrompt: string;
    adjudicationHint: string;
    missConsequenceHint: string;
  }
> {
  const excerpts = extractions
    .filter((e) => e.coreRulesExcerpt || e.adjudicationHint)
    .slice(0, 10)
    .map((e) =>
      [
        e.coreRulesExcerpt ? `CORE: ${e.coreRulesExcerpt}` : "",
        e.adjudicationHint ? `ADJUDICATION: ${e.adjudicationHint}` : "",
        e.missConsequenceHint ? `MISS: ${e.missConsequenceHint}` : "",
      ].filter(Boolean).join("\n")
    )
    .join("\n\n---\n\n");

  if (!excerpts) {
    return {
      coreRulesPrompt:
        "No core rules extracted. Admin should configure manually.",
      adjudicationHint:
        "Fiction first. Trigger moves when the fiction demands it.",
      missConsequenceHint:
        "On a miss, make a hard move. The world has consequences.",
    };
  }

  try {
    const response = await model.invoke([
      new SystemMessage(NARRATIVE_SYSTEM),
      new HumanMessage(`Here are excerpts from the game book:\n\n${excerpts}`),
    ]);
    const text = typeof response.content === "string" ? response.content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch { /* fallback below */ }

  return {
    coreRulesPrompt: excerpts.slice(0, 1000),
    adjudicationHint:
      "Fiction first. Trigger moves when the fiction demands it.",
    missConsequenceHint:
      "On a miss, make a hard move. The world has consequences.",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function mostCommon<T>(arr: T[]): T | undefined {
  if (!arr.length) return undefined;
  const counts = new Map<string, number>();
  for (const v of arr) {
    const k = String(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = arr[0];
  let bestCount = 0;
  for (const [k, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = arr.find((v) => String(v) === k) ?? arr[0];
    }
  }
  return best;
}
