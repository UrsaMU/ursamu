/**
 * Resolve the on-disk path for the primary TypeGraph/PGlite store.
 *
 * Priority (production):
 *   1. config `server.db` (after initConfig)
 *   2. env `URSAMU_TYPEGRAPH_DB`
 *   3. default `data/typegraph.db`
 *
 * Tests use `memory://` unless config is a non-default path or
 * `URSAMU_TYPEGRAPH_DB` is set. Relative paths resolve against cwd.
 */
import { isAbsolute, join } from "@std/path";
import { getConfig } from "../config/mod.ts";

export const DEFAULT_TYPEGRAPH_DB = "data/typegraph.db";
export const DEFAULT_DENOKV_DB = "data/ursamu.db";

function checkIsTest(): boolean {
  if (typeof Deno === "undefined") return false;
  if (typeof Deno.test !== "function") return false;
  const main = Deno.mainModule;
  if (!main) return false;
  return (
    main.includes(".test.") ||
    main.includes("_test.") ||
    main.includes("/tests/") ||
    main.includes("/test/")
  );
}

function nonEmpty(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Make a filesystem path absolute against cwd. */
export function absolutizeDbPath(raw: string): string {
  if (raw === "memory://") return raw;
  if (isAbsolute(raw)) return raw;
  return join(Deno.cwd(), raw);
}

/**
 * Pure picker — exported for unit tests.
 * `isTest` forces memory when no explicit override is present.
 */
export function pickTypegraphDbRaw(opts: {
  isTest: boolean;
  config?: string;
  env?: string;
}): string {
  const fromConfig = nonEmpty(opts.config);
  const fromEnv = nonEmpty(opts.env);

  if (opts.isTest) {
    // Non-default config still wins (assert config-first behavior).
    if (fromConfig && fromConfig !== DEFAULT_TYPEGRAPH_DB) {
      return fromConfig;
    }
    if (fromEnv) return fromEnv;
    return "memory://";
  }

  return fromConfig ?? fromEnv ?? DEFAULT_TYPEGRAPH_DB;
}

/**
 * Primary TypeGraph/PGlite data directory (or `memory://`).
 * Call after `initConfig()` so `server.db` is loaded.
 */
export function resolveTypegraphDbPath(): string {
  const raw = pickTypegraphDbRaw({
    isTest: checkIsTest(),
    config: getConfig<string>("server.db"),
    env: Deno.env.get("URSAMU_TYPEGRAPH_DB") ?? undefined,
  });
  return absolutizeDbPath(raw);
}

/**
 * Fallback Deno KV path when DenoKvAdapter is selected.
 * Does not reuse `server.db` (that key is TypeGraph primary).
 */
export function resolveDenokvDbPath(): string {
  const fromEnv = nonEmpty(Deno.env.get("URSAMU_DB"));
  const fromConfig = nonEmpty(getConfig<string>("server.kv"));
  const raw = fromEnv ?? fromConfig ?? DEFAULT_DENOKV_DB;
  return absolutizeDbPath(raw);
}

/**
 * Ensure a TypeGraph dataDir is usable: parent exists, path is not a
 * plain file (legacy Deno KV sqlite files must not be reused as PGlite).
 */
export async function ensureTypegraphDataDir(
  dbDir: string,
): Promise<void> {
  if (dbDir === "memory://") return;

  try {
    const st = await Deno.stat(dbDir);
    if (st.isFile) {
      throw new Error(
        `[TypeGraphAdapter] server.db path "${dbDir}" is a file. ` +
          `TypeGraph/PGlite needs a directory ` +
          `(e.g. "data/typegraph.db"). Update config.server.db ` +
          `or set URSAMU_TYPEGRAPH_DB.`,
      );
    }
  } catch (e: unknown) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  const parent = dbDir.replace(/\/[^/]+$/, "");
  if (parent && parent !== dbDir) {
    await Deno.mkdir(parent, { recursive: true }).catch((e: unknown) => {
      if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
    });
  }
}
