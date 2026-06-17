import { assertEquals } from "@std/assert";

import {
  invalidatePluginConfigCache,
  resolveDefaultCommandToggle,
} from "../plugin-config.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ENGINE_PATH = "./config/config.json";
const LOCAL_PATH = "./config/map.json";

interface EngineFile {
  plugins?: { map?: { defaultCommands?: { map?: boolean; move?: boolean } } };
  [k: string]: unknown;
}

async function readEngineConfig(): Promise<EngineFile> {
  try {
    return JSON.parse(await Deno.readTextFile(ENGINE_PATH)) as EngineFile;
  } catch {
    return {};
  }
}

async function withEngineMap(
  pluginMap: EngineFile["plugins"] extends infer P
    ? P extends { map?: infer M } ? M | undefined : never
    : never,
  fn: () => void | Promise<void>,
): Promise<void> {
  const original = await readEngineConfig();
  const next: EngineFile = { ...original };
  next.plugins = { ...(original.plugins ?? {}), map: pluginMap };
  await Deno.writeTextFile(ENGINE_PATH, JSON.stringify(next, null, 2));
  invalidatePluginConfigCache();
  try {
    await fn();
  } finally {
    await Deno.writeTextFile(ENGINE_PATH, JSON.stringify(original, null, 2));
    invalidatePluginConfigCache();
  }
}

async function withLocalFile(
  body: unknown,
  fn: () => void | Promise<void>,
): Promise<void> {
  await Deno.writeTextFile(LOCAL_PATH, JSON.stringify(body));
  invalidatePluginConfigCache();
  try {
    await fn();
  } finally {
    await Deno.remove(LOCAL_PATH).catch(() => {});
    invalidatePluginConfigCache();
  }
}

function withEnv(value: string | null, fn: () => void): void {
  const prev = Deno.env.get("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS");
  if (value === null) Deno.env.delete("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS");
  else Deno.env.set("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS", value);
  try {
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS");
    else Deno.env.set("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS", prev);
  }
}

Deno.test("plugin-config: default → both register", OPTS, () => {
  invalidatePluginConfigCache();
  withEnv(null, () => {
    assertEquals(resolveDefaultCommandToggle(), { map: true, move: true });
  });
});

Deno.test("plugin-config: local file alone disables move", OPTS, async () => {
  await withLocalFile({ defaultCommands: { move: false } }, () => {
    withEnv(null, () => {
      assertEquals(resolveDefaultCommandToggle(), { map: true, move: false });
    });
  });
});

Deno.test("plugin-config: engine config alone disables move", OPTS, async () => {
  await withEngineMap({ defaultCommands: { move: false } }, () => {
    withEnv(null, () => {
      assertEquals(resolveDefaultCommandToggle(), { map: true, move: false });
    });
  });
});

Deno.test("plugin-config: engine config wins over local (per-key merge)", OPTS, async () => {
  // Local says skip both. Engine config says register map only.
  // Expect: map=true (engine wins for map), move=false (local provides default, engine has no override for move).
  await withLocalFile({ defaultCommands: { map: false, move: false } }, async () => {
    await withEngineMap({ defaultCommands: { map: true } }, () => {
      withEnv(null, () => {
        assertEquals(resolveDefaultCommandToggle(), { map: true, move: false });
      });
    });
  });
});

Deno.test("plugin-config: engine config fully overrides local for keys it sets", OPTS, async () => {
  await withLocalFile({ defaultCommands: { map: true, move: true } }, async () => {
    await withEngineMap({ defaultCommands: { map: false, move: false } }, () => {
      withEnv(null, () => {
        assertEquals(resolveDefaultCommandToggle(), { map: false, move: false });
      });
    });
  });
});

Deno.test("plugin-config: env var kills both regardless of files", OPTS, async () => {
  await withLocalFile({ defaultCommands: { map: true, move: true } }, async () => {
    await withEngineMap({ defaultCommands: { map: true, move: true } }, () => {
      withEnv("1", () => {
        assertEquals(resolveDefaultCommandToggle(), { map: false, move: false });
      });
    });
  });
});

Deno.test("plugin-config: explicit opts beat env var and config files", OPTS, async () => {
  await withEngineMap({ defaultCommands: { map: false, move: false } }, () => {
    withEnv("1", () => {
      assertEquals(
        resolveDefaultCommandToggle({ map: true, move: true }),
        { map: true, move: true },
      );
    });
  });
});

Deno.test("plugin-config: missing files → defaults", OPTS, () => {
  invalidatePluginConfigCache();
  withEnv(null, () => {
    // No local file; engine config has no plugins.map block.
    assertEquals(resolveDefaultCommandToggle(), { map: true, move: true });
  });
});
