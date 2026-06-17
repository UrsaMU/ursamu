const _defaults: Record<string, unknown> = {
  server: {
    port:           4201,
    telnetPort:     4202,
    db:             "data/db",
    jwtSecret:      "",
    maxConnections: 1000,
    rateLimit:      10,
  },
};

let _config: Record<string, unknown> = structuredClone(_defaults);

function dotGet(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    // Read only own properties — prevents Object.prototype leak via dotGet.
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function dotSet(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof cur[part] !== "object" || cur[part] === null) cur[part] = {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function getConfig<T>(key: string, fallback?: T): T {
  const val = dotGet(_config, key);
  return (val !== undefined ? val : fallback) as T;
}

export function setConfig(key: string, value: unknown): void {
  dotSet(_config, key, value);
}

export function getAllConfig(): Record<string, unknown> {
  return structuredClone(_config);
}

export async function initConfig(overrides?: Record<string, unknown>): Promise<void> {
  const configPath = "config/config.json";
  try {
    const text = await Deno.readTextFile(configPath);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    _config = mergeDeep(structuredClone(_defaults), parsed);
  } catch (e: unknown) {
    if (!(e instanceof Deno.errors.NotFound)) {
      console.warn("[config] Could not read config file:", e);
    }
  }
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (_isDangerousKey(key)) continue;
      dotSet(_config, key, value);
    }
  }
}

const _DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);

function _isDangerousKey(key: string): boolean {
  return _DANGEROUS.has(key);
}

function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    if (_isDangerousKey(key)) continue;
    const sv = source[key];
    const tv = target[key];
    if (isPlainObject(sv) && isPlainObject(tv)) {
      target[key] = mergeDeep(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>,
      );
    } else {
      target[key] = sv;
    }
  }
  return target;
}

function isPlainObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
