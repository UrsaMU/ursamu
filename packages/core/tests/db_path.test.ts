/**
 * Path resolution for TypeGraph primary store and Deno KV fallback.
 */
import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  DEFAULT_TYPEGRAPH_DB,
  DEFAULT_DENOKV_DB,
  absolutizeDbPath,
  ensureTypegraphDataDir,
  pickTypegraphDbRaw,
  resolveDenokvDbPath,
  resolveTypegraphDbPath,
} from "../src/database/path.ts";
import { initConfig, setConfig } from "../src/config/mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("absolutizeDbPath leaves memory:// alone", OPTS, () => {
  assertEquals(absolutizeDbPath("memory://"), "memory://");
});

Deno.test("absolutizeDbPath joins relative to cwd", OPTS, () => {
  assertEquals(
    absolutizeDbPath("data/typegraph.db"),
    join(Deno.cwd(), "data/typegraph.db"),
  );
});

Deno.test("pick: production config first", OPTS, () => {
  assertEquals(
    pickTypegraphDbRaw({
      isTest: false,
      config: "data/from-config.db",
      env: "data/from-env.db",
    }),
    "data/from-config.db",
  );
});

Deno.test("pick: production env when no config", OPTS, () => {
  assertEquals(
    pickTypegraphDbRaw({
      isTest: false,
      env: "data/from-env.db",
    }),
    "data/from-env.db",
  );
});

Deno.test("pick: production default is typegraph", OPTS, () => {
  assertEquals(
    pickTypegraphDbRaw({ isTest: false }),
    DEFAULT_TYPEGRAPH_DB,
  );
});

Deno.test("pick: tests default to memory", OPTS, () => {
  assertEquals(
    pickTypegraphDbRaw({
      isTest: true,
      config: DEFAULT_TYPEGRAPH_DB,
    }),
    "memory://",
  );
});

Deno.test("pick: tests honor non-default config", OPTS, () => {
  assertEquals(
    pickTypegraphDbRaw({
      isTest: true,
      config: "data/custom.db",
      env: "data/env.db",
    }),
    "data/custom.db",
  );
});

Deno.test("pick: tests honor env over default config", OPTS, () => {
  assertEquals(
    pickTypegraphDbRaw({
      isTest: true,
      config: DEFAULT_TYPEGRAPH_DB,
      env: "data/env.db",
    }),
    "data/env.db",
  );
});

Deno.test(
  "resolveTypegraphDbPath uses config when non-default",
  OPTS,
  async () => {
    const prev = Deno.env.get("URSAMU_TYPEGRAPH_DB");
    try {
      Deno.env.delete("URSAMU_TYPEGRAPH_DB");
      await initConfig();
      setConfig("server.db", "data/from-config.db");
      assertEquals(
        resolveTypegraphDbPath(),
        join(Deno.cwd(), "data/from-config.db"),
      );
    } finally {
      if (prev === undefined) Deno.env.delete("URSAMU_TYPEGRAPH_DB");
      else Deno.env.set("URSAMU_TYPEGRAPH_DB", prev);
      setConfig("server.db", DEFAULT_TYPEGRAPH_DB);
    }
  },
);

Deno.test(
  "ensureTypegraphDataDir rejects legacy KV file paths",
  OPTS,
  async () => {
    const dir = await Deno.makeTempDir();
    const filePath = join(dir, "ursamu.db");
    await Deno.writeTextFile(filePath, "not-a-pglite-dir");
    try {
      await assertRejects(
        () => ensureTypegraphDataDir(filePath),
        Error,
        "is a file",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

Deno.test("resolveDenokvDbPath default", OPTS, async () => {
  const prev = Deno.env.get("URSAMU_DB");
  try {
    Deno.env.delete("URSAMU_DB");
    await initConfig();
    setConfig("server.kv", "");
    assertEquals(
      resolveDenokvDbPath(),
      join(Deno.cwd(), DEFAULT_DENOKV_DB),
    );
  } finally {
    if (prev === undefined) Deno.env.delete("URSAMU_DB");
    else Deno.env.set("URSAMU_DB", prev);
  }
});
