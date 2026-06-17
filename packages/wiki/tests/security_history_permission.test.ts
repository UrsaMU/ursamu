/**
 * SECURITY — M1: history endpoint leaks snapshot timestamps for restricted pages.
 *
 * GET /<path>/history must enforce the same readLock/draft check as GET /<path>.
 * Before the patch, handleHistory ignored userId entirely (_userId parameter).
 */
import { assertEquals } from "@std/assert";
import { describe, it, beforeAll, afterAll } from "@std/testing/bdd";
import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { DBO } from "@ursamu/mush";
import { wikiRouteHandler } from "../src/router.ts";
import { saveSnapshot } from "../src/history.ts";
import { serializePage } from "../src/fs.ts";

const REAL_WIKI    = resolve("./wiki");
const REAL_HISTORY = join(REAL_WIKI, ".history");
const TEST_DIR     = "__security_m1__";
const DRAFT_PATH   = `${TEST_DIR}/secret`;

const DRAFT_CONTENT = serializePage(
  { title: "Secret Draft", draft: true },
  "Top-secret body.",
);

function wikiReq(path: string): Request {
  return new Request(`http://localhost/api/v1/wiki/${path}`, { method: "GET" });
}

describe("handleHistory — permission enforcement", () => {
  beforeAll(async () => {
    const dir = join(REAL_WIKI, TEST_DIR);
    await ensureDir(dir);
    await Deno.writeTextFile(join(REAL_WIKI, `${DRAFT_PATH}.md`), DRAFT_CONTENT);
    await saveSnapshot(DRAFT_PATH, DRAFT_CONTENT);
  });

  afterAll(async () => {
    await Deno.remove(join(REAL_WIKI, TEST_DIR), { recursive: true }).catch(() => {});
    await Deno.remove(join(REAL_HISTORY, TEST_DIR), { recursive: true }).catch(() => {});
    await DBO.close();
  });

  it("EXPLOIT: anonymous user receives 403 for draft page history (not 200)", async () => {
    const res = await wikiRouteHandler(wikiReq(`${DRAFT_PATH}/history`), null);
    assertEquals(res.status, 403);
  });

  it("EXPLOIT: authenticated non-admin receives 403 for draft page history", async () => {
    // Non-admin userId — isStaffUser will return false for unknown ID
    const res = await wikiRouteHandler(wikiReq(`${DRAFT_PATH}/history`), "player-abc");
    assertEquals(res.status, 403);
  });

  it("PATCH: non-existent page history returns empty list (no info leak)", async () => {
    const res = await wikiRouteHandler(wikiReq(`${TEST_DIR}/no-such-page/history`), null);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.snapshots, []);
  });
});
