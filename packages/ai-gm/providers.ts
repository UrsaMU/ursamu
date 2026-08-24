import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from
  "@langchain/core/language_models/chat_models";
import type { GMProvider, IGMConfig } from "./schema.ts";

// ─── Provider factory ─────────────────────────────────────────────────────────
//
// Builds a chat model from IGMConfig.provider.
// Keys live in env only — never the DB.
//   anthropic → ANTHROPIC_API_KEY
//   google    → GOOGLE_API_KEY

const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_GOOGLE_MODEL = "gemini-2.0-flash-latest";

/** Resolved provider: config → GM_PROVIDER env → anthropic. */
export function resolveProvider(
  config?: Pick<IGMConfig, "provider"> | null,
): GMProvider {
  const fromCfg = config?.provider;
  if (fromCfg === "anthropic" || fromCfg === "google") {
    return fromCfg;
  }
  const env = (Deno.env.get("GM_PROVIDER") ?? "").trim().toLowerCase();
  if (env === "google" || env === "gemini") return "google";
  if (env === "anthropic" || env === "claude") return "anthropic";
  if (Deno.env.get("ANTHROPIC_API_KEY")?.trim()) return "anthropic";
  if (Deno.env.get("GOOGLE_API_KEY")?.trim()) return "google";
  return "anthropic";
}

export function hasApiKey(provider?: GMProvider): boolean {
  const p = provider ?? resolveProvider();
  if (p === "google") {
    return Boolean(Deno.env.get("GOOGLE_API_KEY")?.trim());
  }
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY")?.trim());
}

/** @deprecated use hasApiKey */
export function hasGoogleApiKey(): boolean {
  return hasApiKey("google");
}

function resolveModelName(
  config: IGMConfig,
  provider: GMProvider,
): string {
  const configured = (config.model ?? "").trim();
  if (configured && !looksLikeWrongProvider(configured, provider)) {
    return configured;
  }
  if (provider === "anthropic") {
    return (
      Deno.env.get("ANTHROPIC_MODEL")?.trim() ||
      DEFAULT_ANTHROPIC_MODEL
    );
  }
  return (
    Deno.env.get("GOOGLE_MODEL")?.trim() ||
    Deno.env.get("GEMINI_MODEL")?.trim() ||
    DEFAULT_GOOGLE_MODEL
  );
}

function looksLikeWrongProvider(
  model: string,
  provider: GMProvider,
): boolean {
  const m = model.toLowerCase();
  if (provider === "anthropic") {
    return m.startsWith("gemini") || m.startsWith("models/");
  }
  return m.startsWith("claude") || m.startsWith("anthropic");
}

/**
 * Build a chat model, or null when the active provider has no API key.
 * Config/watch commands work without a key; LLM paths must null-check.
 */
export function createModel(config: IGMConfig): BaseChatModel | null {
  const provider = resolveProvider(config);
  if (!hasApiKey(provider)) return null;

  const model = resolveModelName(config, provider);
  const temperature = config.temperature;

  if (provider === "google") {
    const apiKey = Deno.env.get("GOOGLE_API_KEY")!.trim();
    return new ChatGoogleGenerativeAI({
      model,
      apiKey,
      temperature,
      maxRetries: 2,
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!.trim();
  return new ChatAnthropic({
    model,
    apiKey,
    temperature,
    maxRetries: 2,
  });
}

/** Like createModel but throws a clear error for LLM call sites. */
export function requireModel(config: IGMConfig): BaseChatModel {
  const provider = resolveProvider(config);
  const model = createModel(config);
  if (!model) {
    const envKey = provider === "google"
      ? "GOOGLE_API_KEY"
      : "ANTHROPIC_API_KEY";
    throw new Error(
      `GM: No ${provider} API key found. Set ${envKey} ` +
        `in your .env file.`,
    );
  }
  return model;
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
