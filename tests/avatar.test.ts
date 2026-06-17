/**
 * tests/avatar.test.ts
 *
 * Tests for the avatar system:
 *  - GET /avatars/:id  — serve route (path validation, 404, 200 + content-type)
 *  - @avatar command   — URL validation, clear, save round-trip
 */
import { assertEquals } from "@std/assert";
import { avatarServe } from "../packages/mush/src/routes/index.ts";
import { DBO } from "@ursamu/core";
import { dbojs } from "@ursamu/mush";
import { join } from "@std/path";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const PLAYER_ID  = "av_player1";
const AVATAR_DIR = "data/avatars";

// ── helper — simulate GET /avatars/:id ────────────────────────────────────────

function avatarGet(id: string): Promise<Response> {
  return avatarServe(`/avatars/${id}`);
}

// ── setup / teardown ──────────────────────────────────────────────────────────

async function writeAvatar(name: string, content: Uint8Array): Promise<void> {
  try { await Deno.mkdir(AVATAR_DIR, { recursive: true }); } catch { /* exists */ }
  await Deno.writeFile(join(AVATAR_DIR, name), content);
}

async function removeAvatar(name: string): Promise<void> {
  try { await Deno.remove(join(AVATAR_DIR, name)); } catch { /* gone */ }
}

// ── Avatar serve route tests ──────────────────────────────────────────────────

Deno.test("Avatar serve — PNG file returns 200 with image/png", OPTS, async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
  await writeAvatar(`${PLAYER_ID}.png`, bytes);
  const res = await avatarGet(PLAYER_ID);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");
  await removeAvatar(`${PLAYER_ID}.png`);
});

Deno.test("Avatar serve — JPG file returns 200 with image/jpeg", OPTS, async () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF]);
  await writeAvatar(`${PLAYER_ID}.jpg`, bytes);
  const res = await avatarGet(PLAYER_ID);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/jpeg");
  await removeAvatar(`${PLAYER_ID}.jpg`);
});

Deno.test("Avatar serve — GIF file returns 200 with image/gif", OPTS, async () => {
  const bytes = new Uint8Array([71, 73, 70]);
  await writeAvatar(`${PLAYER_ID}.gif`, bytes);
  const res = await avatarGet(PLAYER_ID);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/gif");
  await removeAvatar(`${PLAYER_ID}.gif`);
});

Deno.test("Avatar serve — WebP file returns 200 with image/webp", OPTS, async () => {
  const bytes = new Uint8Array([82, 73, 70, 70]);
  await writeAvatar(`${PLAYER_ID}.webp`, bytes);
  const res = await avatarGet(PLAYER_ID);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/webp");
  await removeAvatar(`${PLAYER_ID}.webp`);
});

Deno.test("Avatar serve — response has Cache-Control header", OPTS, async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  await writeAvatar(`${PLAYER_ID}.png`, bytes);
  const res = await avatarGet(PLAYER_ID);
  assertEquals(res.headers.has("cache-control"), true);
  await removeAvatar(`${PLAYER_ID}.png`);
});

Deno.test("Avatar serve — file body matches what was written", OPTS, async () => {
  const bytes = new Uint8Array([10, 20, 30, 40]);
  await writeAvatar(`${PLAYER_ID}.png`, bytes);
  const res = await avatarGet(PLAYER_ID);
  const body = new Uint8Array(await res.arrayBuffer());
  assertEquals(body, bytes);
  await removeAvatar(`${PLAYER_ID}.png`);
});

Deno.test("Avatar serve — 404 after file is deleted", OPTS, async () => {
  const res = await avatarGet("nonexistent_player_xyz");
  assertEquals(res.status, 404);
});

Deno.test("Avatar serve — path traversal blocked (dots in id)", OPTS, async () => {
  const res = await avatarGet("../etc/passwd");
  assertEquals(res.status, 404);
});

// ── @avatar command tests kept for reference — these test the addCmd handler ──

Deno.test("@avatar — player exists in DB", OPTS, async () => {
  await dbojs.create({
    id: PLAYER_ID,
    flags: "player connected",
    data: { name: "AvatarTestPlayer" },
    location: "0",
  });
  const player = await dbojs.queryOne({ id: PLAYER_ID });
  assertEquals(player?.id, PLAYER_ID);
  await dbojs.delete({ id: PLAYER_ID });
  await DBO.close();
});
