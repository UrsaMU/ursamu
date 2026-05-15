/**
 * Unit tests for InstallTxn — the per-run transaction object that tracks
 * directory creations and registry mutations, and rolls back on failure.
 */
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { InstallTxn } from "../src/utils/pluginTxn.ts";
import type { Registry, RegistryEntry } from "../src/cli/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeEntry(name: string, version = "1.0.0"): RegistryEntry {
  return {
    name,
    version,
    description: "",
    source:      "https://github.com/foo/" + name,
    author:      "unknown",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt:   "2026-01-01T00:00:00.000Z",
  };
}

async function dirExists(p: string): Promise<boolean> {
  try { await Deno.stat(p); return true; } catch { return false; }
}

Deno.test("InstallTxn.recordDir + rollback removes the directory", OPTS, async () => {
  const base = await Deno.makeTempDir({ prefix: "ursamu-txn-" });
  try {
    const dir = join(base, "plugin-x");
    await Deno.mkdir(dir);
    await Deno.writeTextFile(join(dir, "marker.txt"), "hi");

    const txn = new InstallTxn();
    txn.recordDir(dir);
    await txn.rollback({});

    assertEquals(await dirExists(dir), false);
  } finally {
    await Deno.remove(base, { recursive: true }).catch(() => {});
  }
});

Deno.test("InstallTxn.recordRegistry with previous=undefined → rollback deletes key", OPTS, async () => {
  const reg: Registry = {};
  const txn = new InstallTxn();
  txn.recordRegistry("foo", undefined);
  reg["foo"] = makeEntry("foo");

  await txn.rollback(reg);
  assertEquals(reg["foo"], undefined);
});

Deno.test("InstallTxn.recordRegistry with a previous entry → rollback restores it", OPTS, async () => {
  const prev = makeEntry("foo", "1.0.0");
  const reg: Registry = { foo: prev };
  const txn = new InstallTxn();
  txn.recordRegistry("foo", prev);
  reg["foo"] = makeEntry("foo", "2.0.0");

  await txn.rollback(reg);
  assertEquals(reg["foo"], prev);
});

Deno.test("InstallTxn.commit makes rollback a no-op", OPTS, async () => {
  const base = await Deno.makeTempDir({ prefix: "ursamu-txn-" });
  try {
    const dir = join(base, "kept");
    await Deno.mkdir(dir);

    const reg: Registry = {};
    const txn = new InstallTxn();
    txn.recordDir(dir);
    txn.recordRegistry("foo", undefined);
    reg["foo"] = makeEntry("foo");
    txn.commit();

    await txn.rollback(reg);

    assertEquals(await dirExists(dir), true, "dir preserved post-commit");
    assert(reg["foo"] !== undefined, "registry entry preserved post-commit");
  } finally {
    await Deno.remove(base, { recursive: true }).catch(() => {});
  }
});

Deno.test("InstallTxn.rollback is idempotent (safe to call twice)", OPTS, async () => {
  const base = await Deno.makeTempDir({ prefix: "ursamu-txn-" });
  try {
    const dir = join(base, "plugin-y");
    await Deno.mkdir(dir);

    const reg: Registry = {};
    const txn = new InstallTxn();
    txn.recordDir(dir);
    txn.recordRegistry("bar", undefined);
    reg["bar"] = makeEntry("bar");

    await txn.rollback(reg);
    await txn.rollback(reg);

    assertEquals(await dirExists(dir), false);
    assertEquals(reg["bar"], undefined);
  } finally {
    await Deno.remove(base, { recursive: true }).catch(() => {});
  }
});

Deno.test("InstallTxn.rollback of a missing directory does not throw", OPTS, async () => {
  const txn = new InstallTxn();
  txn.recordDir("/tmp/this/path/definitely/does/not/exist-ursamu-test");

  const origWarn = console.warn;
  console.warn = () => {};
  try {
    await txn.rollback({});
  } finally {
    console.warn = origWarn;
  }
});
