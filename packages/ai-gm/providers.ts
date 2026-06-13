import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { IGMConfig } from "./schema.ts";

// ─── Provider factory ─────────────────────────────────────────────────────────
//
// Returns a ChatGoogleGenerativeAI instance configured from IGMConfig.
// API key is read exclusively from the GOOGLE_API_KEY environment variable.
// Set it in your .env file — never store API keys in the database.

export function createModel(config: IGMConfig): ChatGoogleGenerativeAI {
  const apiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";

  if (!apiKey) {
    throw new Error(
      "GM: No Google API key found. Set GOOGLE_API_KEY in your .env file.",
    );
  }

  return new ChatGoogleGenerativeAI({
    model: config.model,
    apiKey,
    temperature: config.temperature,
    maxRetries: 2,
  });
}

// ─── Config loader with default fallback ─────────────────────────────────────

import { gmConfig } from "./db.ts";
import { DEFAULT_CONFIG } from "./schema.ts";

export async function loadConfig(): Promise<IGMConfig> {
  const stored = await gmConfig.queryOne(
    { id: "singleton" } as Parameters<typeof gmConfig.queryOne>[0],
  );
  return stored ?? { ...DEFAULT_CONFIG, updatedAt: 0 };
}

export async function saveConfig(
  update: Partial<Omit<IGMConfig, "id">>,
): Promise<IGMConfig> {
  // LOW-04: bound roundTimeoutSeconds to prevent timer-based DoS
  if (update.roundTimeoutSeconds !== undefined) {
    update.roundTimeoutSeconds = Math.max(
      30,
      Math.min(86400, update.roundTimeoutSeconds),
    );
  }
  const current = await loadConfig();
  const next: IGMConfig = {
    ...current,
    ...update,
    id: "singleton",
    updatedAt: Date.now(),
  };

  const existing = await gmConfig.queryOne(
    { id: "singleton" } as Parameters<typeof gmConfig.queryOne>[0],
  );
  if (existing) {
    await gmConfig.modify(
      { id: "singleton" } as Parameters<typeof gmConfig.modify>[0],
      "$set",
      { ...update, updatedAt: next.updatedAt },
    );
  } else {
    await gmConfig.create(next);
  }
  return next;
}
