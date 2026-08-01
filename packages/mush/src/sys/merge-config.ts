/**
 * Merge config.sample.json → config/config.json for game deploys.
 *
 * Live config is often gitignored. New games / @restart / safe-update must
 * still pick up new server.plugins entries and plugins.* blocks (e.g. map)
 * from the sample without wiping live secrets.
 */

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

/** Deep-merge `over` into `base`. Objects recurse; arrays/scalars: over wins. */
export function deepMerge(base: Json, over: Json): Json {
  if (
    base !== null &&
    over !== null &&
    typeof base === "object" &&
    typeof over === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(over)
  ) {
    const out: { [k: string]: Json } = {
      ...(base as { [k: string]: Json }),
    };
    for (const [k, v] of Object.entries(over as object)) {
      if (k in out) {
        out[k] = deepMerge(out[k] as Json, v as Json);
      } else {
        out[k] = v as Json;
      }
    }
    return out;
  }
  return over;
}

/**
 * Sample order is canonical for known plugins; live-only extras append.
 */
export function ensurePluginsList(
  live: string[],
  sample: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of sample) {
    const n = String(name ?? "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  for (const name of live) {
    const n = String(name ?? "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export type MergeConfigResult = {
  config: Record<string, unknown>;
  addedPlugins: string[];
  mergedBlocks: string[];
  changed: boolean;
};

/**
 * Pure merge of sample → live game config.
 * Does not touch disk.
 */
export function mergeConfigFromSample(
  liveRaw: unknown,
  sampleRaw: unknown,
): MergeConfigResult {
  const live = (
    liveRaw && typeof liveRaw === "object" && !Array.isArray(liveRaw)
      ? structuredClone(liveRaw)
      : {}
  ) as Record<string, unknown>;
  const sample = (
    sampleRaw && typeof sampleRaw === "object" &&
      !Array.isArray(sampleRaw)
      ? sampleRaw
      : {}
  ) as Record<string, unknown>;

  const before = JSON.stringify(live);
  const addedPlugins: string[] = [];
  const mergedBlocks: string[] = [];

  const liveSrv = (
    live.server && typeof live.server === "object"
      ? live.server as Record<string, unknown>
      : (live.server = {})
  ) as Record<string, unknown>;
  const sampleSrv = (
    sample.server && typeof sample.server === "object"
      ? sample.server as Record<string, unknown>
      : {}
  );

  const liveList = Array.isArray(liveSrv.plugins)
    ? (liveSrv.plugins as unknown[]).map(String)
    : [];
  const sampleList = Array.isArray(sampleSrv.plugins)
    ? (sampleSrv.plugins as unknown[]).map(String)
    : [];

  if (sampleList.length) {
    const merged = ensurePluginsList(liveList, sampleList);
    const beforeSet = new Set(liveList);
    for (const p of merged) {
      if (!beforeSet.has(p)) addedPlugins.push(p);
    }
    liveSrv.plugins = merged;
  }

  const livePl = (
    live.plugins && typeof live.plugins === "object"
      ? live.plugins as Record<string, unknown>
      : (live.plugins = {})
  ) as Record<string, unknown>;
  const samplePl = (
    sample.plugins && typeof sample.plugins === "object"
      ? sample.plugins as Record<string, unknown>
      : {}
  );

  for (const [key, val] of Object.entries(samplePl)) {
    if (!(key in livePl)) {
      livePl[key] = structuredClone(val);
      mergedBlocks.push(key);
      continue;
    }
    const prev = JSON.stringify(livePl[key]);
    livePl[key] = deepMerge(
      livePl[key] as Json,
      val as Json,
    );
    if (JSON.stringify(livePl[key]) !== prev) {
      mergedBlocks.push(key);
    }
  }

  // Ensure channels defaults exist
  if (!livePl.channels || typeof livePl.channels !== "object") {
    livePl.channels = {
      defaults: [
        {
          name: "Public",
          alias: "pub",
          lock: "connected",
          announce: true,
        },
        {
          name: "Admin",
          alias: "ad",
          lock: "connected admin+",
          announce: false,
        },
      ],
    };
    if (!mergedBlocks.includes("channels")) {
      mergedBlocks.push("channels");
    }
  }

  const after = JSON.stringify(live);
  return {
    config: live,
    addedPlugins,
    mergedBlocks,
    changed: before !== after,
  };
}

/** Read sample + live from cwd and write merged live config. */
export async function applyConfigSampleMerge(
  cwd: string,
): Promise<MergeConfigResult & { wrote: boolean }> {
  const livePath = `${cwd}/config/config.json`;
  const samplePath = `${cwd}/config/config.sample.json`;

  let liveRaw: unknown = {};
  let sampleRaw: unknown = {};
  try {
    liveRaw = JSON.parse(await Deno.readTextFile(livePath));
  } catch {
    /* start empty */
  }
  try {
    sampleRaw = JSON.parse(await Deno.readTextFile(samplePath));
  } catch {
    return {
      config: (liveRaw && typeof liveRaw === "object"
        ? liveRaw
        : {}) as Record<string, unknown>,
      addedPlugins: [],
      mergedBlocks: [],
      changed: false,
      wrote: false,
    };
  }

  const result = mergeConfigFromSample(liveRaw, sampleRaw);
  if (!result.changed) {
    return { ...result, wrote: false };
  }
  await Deno.mkdir(`${cwd}/config`, { recursive: true });
  await Deno.writeTextFile(
    livePath,
    JSON.stringify(result.config, null, 2) + "\n",
  );
  return { ...result, wrote: true };
}
