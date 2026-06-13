// ─── Ingestion Reviewer ───────────────────────────────────────────────────────
//
// Drives the guided admin setup conversation. After synthesis, the reviewer:
//   1. Pages all top-level admins into the AI-GM board
//   2. Presents the draft game system and any uncertain items
//   3. Waits for admin responses via +gm/ingest/review commands
//   4. Saves every exchange to the job record
//   5. When all items are resolved, commits the system

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  IIngestionExchange,
  IIngestionJob,
  IUncertainItem,
} from "./schema.ts";
import { gmIngestionJobs } from "./db.ts";
import { saveCustomSystem } from "../systems/store.ts";
import type { IGameSystem } from "../systems/interface.ts";

// ─── Build the opening message to admins ─────────────────────────────────────

export function buildOpeningMessage(job: IIngestionJob): string {
  const draft = job.draft!;
  const lines = [
    `[AI-GM] I have finished reading your game books: ${job.files.join(", ")}`,
    ``,
    `Here is what I found:`,
    `  Game:       ${draft.gameName} (${draft.version})`,
    `  Stats:      ${draft.stats.join(", ") || "none found"}`,
    `  Full success:    ${draft.moveThresholds.fullSuccess}+`,
    `  Partial success: ${draft.moveThresholds.partialSuccess}-${
      draft.moveThresholds.fullSuccess - 1
    }`,
    `  Miss:            below ${draft.moveThresholds.partialSuccess}`,
    `  Hard moves: ${draft.hardMoves.length} found`,
    `  Soft moves: ${draft.softMoves.length} found`,
    `  Tone:       ${draft.tone}`,
    ``,
  ];

  if (job.uncertainItems.length === 0) {
    lines.push(
      `Everything looks clear. Type +gm/ingest/approve ${job.id} to activate this system,`,
      `or +gm/ingest/reject ${job.id} to cancel.`,
    );
  } else {
    lines.push(
      `I have ${job.uncertainItems.length} item(s) that need your review:`,
      ``,
    );
    for (let i = 0; i < job.uncertainItems.length; i++) {
      const item = job.uncertainItems[i];
      lines.push(
        `[${i + 1}] ${item.field}`,
        `    Found: ${item.foundValues.join(" / ")} (from: ${
          item.sources.join(", ")
        })`,
        `    My recommendation: ${item.gmSuggestion}`,
        `    Resolve with: +gm/ingest/review ${job.id}/${item.id}=<value>`,
        `    Skip with:    +gm/ingest/review ${job.id}/${item.id}/skip`,
        ``,
      );
    }
    lines.push(
      `After reviewing all items, type +gm/ingest/approve ${job.id} to activate.`,
    );
  }

  return lines.join("\n");
}

// ─── Apply admin resolution to an uncertain item ──────────────────────────────

export async function resolveItem(
  job: IIngestionJob,
  itemId: string,
  value: string | null, // null = skip (accept suggestion)
  adminId: string,
  adminName: string,
  model: ChatGoogleGenerativeAI,
): Promise<string> {
  const item = job.uncertainItems.find((i) => i.id === itemId);
  if (!item) return `Unknown item ID: ${itemId}`;
  if (item.resolved) return `Item already resolved.`;

  const resolvedValue = value ?? item.gmSuggestion;
  item.resolved = true;
  item.resolvedValue = resolvedValue;

  const exchange: IIngestionExchange = {
    role: "admin",
    adminId,
    adminName,
    message: value
      ? `Set ${item.field} = ${value}`
      : `Accepted suggestion for ${item.field}`,
    timestamp: new Date().toISOString(),
  };
  job.exchanges.push(exchange);

  // Apply to draft
  applyResolution(job, item, resolvedValue);

  // GM acknowledges
  const ack = await generateAck(model, item, String(resolvedValue));
  job.exchanges.push({
    role: "gm",
    message: ack,
    timestamp: new Date().toISOString(),
  });

  const remaining = job.uncertainItems.filter((i) => !i.resolved).length;
  const suffix = remaining === 0
    ? `\nAll items resolved. Type +gm/ingest/approve ${job.id} to activate.`
    : `\n${remaining} item(s) remaining.`;

  await saveJob(job);
  return ack + suffix;
}

// ─── Commit the approved system ───────────────────────────────────────────────

export async function commitSystem(
  job: IIngestionJob,
  adminId: string,
  adminName: string,
): Promise<string> {
  const draft = job.draft!;

  const system: IGameSystem = {
    id: slugify(draft.gameName),
    name: draft.gameName,
    version: draft.version,
    source: "ingested",
    ingestedFrom: job.files,
    confidence: {},
    coreRulesPrompt: draft.coreRulesPrompt,
    moveThresholds: draft.moveThresholds,
    stats: draft.stats,
    adjudicationHint: draft.adjudicationHint,
    hardMoves: draft.hardMoves,
    softMoves: draft.softMoves,
    missConsequenceHint: draft.missConsequenceHint,
    getCategories: () => draft.categories,
    getStats: (cat?: string) =>
      cat ? (draft.statsByCategory[cat] ?? []) : draft.stats,
    getStat: (actor: Record<string, unknown>, stat: string) =>
      actor[stat.toLowerCase()] ?? 0,
    setStat: (actor: Record<string, unknown>, stat: string, value: unknown) => {
      actor[stat.toLowerCase()] = value;
      return Promise.resolve();
    },
    validate: (_stat: string, value: unknown) => typeof value === "number",
    formatMoveResult: (moveName, _stat, total) => {
      const { fullSuccess, partialSuccess } = draft.moveThresholds;
      const tier = total >= fullSuccess
        ? "Full success"
        : total >= partialSuccess
        ? "Partial success"
        : "Miss";
      return `${moveName} (${total}): ${tier}`;
    },
    formatCharacterContext: (sheet) => {
      const lines = [`CHARACTER: ${sheet.name}`];
      for (const stat of draft.stats) {
        const val = (sheet as Record<string, unknown>)[stat.toLowerCase()];
        if (val !== undefined) lines.push(`  ${stat}: ${val}`);
      }
      return lines.join("\n");
    },
  };

  await saveCustomSystem(system);

  job.phase = "committed";
  job.committedSystemId = system.id;
  job.exchanges.push({
    role: "admin",
    adminId,
    adminName,
    message: "Approved system.",
    timestamp: new Date().toISOString(),
  });
  job.exchanges.push({
    role: "gm",
    message:
      `System "${system.name}" activated. Use +gm/config/system ${system.id} to switch to it now, or it will apply on the next +gm/session/open.`,
    timestamp: new Date().toISOString(),
  });

  await saveJob(job);
  return `[AI-GM] "${system.name}" is now available. Use +gm/config/system ${system.id} to activate.`;
}

// ─── Apply a resolution to the draft ─────────────────────────────────────────

// CRIT-03: explicit allowlist prevents prototype pollution via AI-generated field names
const ALLOWED_DRAFT_FIELDS = new Set([
  "gameName",
  "version",
  "tone",
  "adjudicationHint",
  "missConsequenceHint",
  "coreRulesPrompt",
]);

export function applyResolution(
  job: IIngestionJob,
  item: IUncertainItem,
  value: unknown,
): void {
  if (!job.draft) return;
  switch (item.field) {
    case "moveThresholds.fullSuccess":
      job.draft.moveThresholds.fullSuccess = Number(value);
      break;
    case "moveThresholds.partialSuccess":
      job.draft.moveThresholds.partialSuccess = Number(value);
      break;
    case "stats":
      job.draft.stats = String(value).split(",").map((s) => s.trim()).filter(
        Boolean,
      );
      break;
    default:
      // Only write fields on the explicit allowlist — no prototype pollution
      if (ALLOWED_DRAFT_FIELDS.has(item.field)) {
        (job.draft as unknown as Record<string, unknown>)[item.field] = value;
      } else {
        console.warn(
          `[GM ingestion] Rejected unknown field in applyResolution: "${item.field}"`,
        );
      }
  }
}

// ─── LLM acknowledgement ──────────────────────────────────────────────────────

async function generateAck(
  model: ChatGoogleGenerativeAI,
  item: IUncertainItem,
  value: string,
): Promise<string> {
  try {
    const response = await model.invoke([
      new SystemMessage(
        "You are an AI Game Master assistant helping configure a new game system. " +
          "Respond briefly (1-2 sentences) acknowledging the admin's choice. Be helpful and encouraging.",
      ),
      new HumanMessage(
        `Admin set ${item.field} to "${value}". Acknowledge this concisely.`,
      ),
    ]);
    const text = typeof response.content === "string" ? response.content : "";
    return `[AI-GM] ${text.trim()}`;
  } catch {
    return `[AI-GM] Got it — ${item.field} set to "${value}".`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function saveJob(job: IIngestionJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await gmIngestionJobs.update({ id: job.id }, job);
}

export function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-|-$/g,
    "",
  );
  return slug || "unknown";
}
