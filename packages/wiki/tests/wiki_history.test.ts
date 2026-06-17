/**
 * Tests for history.ts — saveSnapshot, listHistory, readSnapshot, migrateHistory
 */
import { assertEquals } from "@std/assert";
import { describe, it, afterEach } from "@std/testing/bdd";
import { join, resolve } from "@std/path";
import { saveSnapshot, listHistory, readSnapshot, migrateHistory } from "../src/history.ts";

// Override WIKI_DIR for tests via env or stub
// We redirect by patching the module's resolve calls via a tmp dir strategy:
// Since WIKI_DIR is a constant, we test against the real path but with temp files.
// This works because WIKI_DIR = "./wiki" resolved to CWD/wiki.

const REAL_WIKI = resolve("./wiki");
const REAL_HISTORY = join(REAL_WIKI, ".history");

describe("history snapshots", () => {
  const testPath = `__test__/${Date.now()}`;

  afterEach(async () => {
    try {
      await Deno.remove(join(REAL_HISTORY, testPath), { recursive: true });
    } catch { /* ok */ }
  });

  it("saveSnapshot writes a file and listHistory returns it", async () => {
    await saveSnapshot(testPath, "# Content\nBody here.");
    const snapshots = await listHistory(testPath);
    assertEquals(snapshots.length >= 1, true);
  });

  it("listHistory returns most-recent first", async () => {
    await saveSnapshot(testPath, "version 1");
    await new Promise((r) => setTimeout(r, 10)); // ensure different mtime
    await saveSnapshot(testPath, "version 2");
    const snapshots = await listHistory(testPath);
    assertEquals(snapshots.length >= 2, true);
    // Lexicographic descending — later timestamp should come first
    assertEquals(snapshots[0] > snapshots[1], true);
  });

  it("readSnapshot returns content for valid timestamp", async () => {
    const content = "# Snapshot Content\nBody text.";
    await saveSnapshot(testPath, content);
    const snapshots = await listHistory(testPath);
    const read = await readSnapshot(testPath, snapshots[0]);
    assertEquals(read, content);
  });

  it("readSnapshot returns null for missing timestamp", async () => {
    const result = await readSnapshot(testPath, "2000-01-01T00-00-00.000Z");
    assertEquals(result, null);
  });

  it("readSnapshot rejects path traversal in timestamp", async () => {
    const result = await readSnapshot(testPath, "../../../etc/passwd");
    assertEquals(result, null);
  });

  it("listHistory returns empty array for unknown path", async () => {
    const snapshots = await listHistory("__nonexistent__/page");
    assertEquals(snapshots, []);
  });

  it("migrateHistory moves snapshots and removes source dir", async () => {
    const src = `__test_src__/${Date.now()}`;
    const dst = `__test_dst__/${Date.now()}`;
    try {
      await saveSnapshot(src, "migrated content");
      const beforeDst = await listHistory(dst);
      assertEquals(beforeDst.length, 0);

      await migrateHistory(src, dst);

      const afterSrc = await listHistory(src);
      const afterDst = await listHistory(dst);
      assertEquals(afterSrc.length, 0);
      assertEquals(afterDst.length >= 1, true);
    } finally {
      await Deno.remove(join(REAL_HISTORY, dst), { recursive: true }).catch(() => {});
      await Deno.remove(join(REAL_HISTORY, src), { recursive: true }).catch(() => {});
    }
  });
});
