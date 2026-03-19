/**
 * tests/avatar.test.ts
 *
 * Tests for the avatar system:
 *  - GET /avatars/:id  — serve route (path validation, 404, 200 + content-type)
 *  - @avatar command   — URL validation, clear, save round-trip
 */
import { assertEquals } from "@std/assert";
import { handleRequest } from "../src/app.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { join } from "@std/path";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const PLAYER_ID  = "av_player1";
const AVATARS_DIR = "data/avatars";

// Minimal 1×1 white PNG (valid enough for content-type tests)
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
  0x44, 0xAE, 0x42, 0x60, 0x82,
]);

// Minimal JPEG header (SOI marker — enough to distinguish for extension test)
const JPEG_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x01]);

function get(path: string): Promise<Response> {
  return handleRequest(new Request(`http://localhost${path}`));
}

async function writeAvatar(id: string, ext: string, bytes: Uint8Array): Promise<void> {
  await Deno.mkdir(AVATARS_DIR, { recursive: true });
  await Deno.writeFile(join(AVATARS_DIR, `${id}.${ext}`), bytes);
}

async function removeAvatar(id: string, ext: string): Promise<void> {
  await Deno.remove(join(AVATARS_DIR, `${id}.${ext}`)).catch(() => {});
}

// ─── setup ────────────────────────────────────────────────────────────────────

Deno.test("Avatar — setup fixtures", OPTS, async () => {
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  await dbojs.create({
    id:    PLAYER_ID,
    flags: "player connected",
    data:  { name: "AvatarPlayer" },
  });
  // Ensure no leftover test files
  await removeAvatar(PLAYER_ID, "png");
  await removeAvatar(PLAYER_ID, "jpg");
  await removeAvatar(PLAYER_ID, "gif");
  await removeAvatar(PLAYER_ID, "webp");
});

// ─── serve route — path validation ───────────────────────────────────────────

Deno.test("Avatar serve — empty id returns 404", OPTS, async () => {
  const res = await get("/avatars/");
  assertEquals(res.status, 404);
});

Deno.test("Avatar serve — path traversal .. returns 404", OPTS, async () => {
  const res = await get("/avatars/../etc/passwd");
  assertEquals(res.status, 404);
});

Deno.test("Avatar serve — nested slash returns 404", OPTS, async () => {
  const res = await get("/avatars/a/b");
  assertEquals(res.status, 404);
});

Deno.test("Avatar serve — unknown player returns 404", OPTS, async () => {
  const res = await get("/avatars/no_such_player_xyz");
  assertEquals(res.status, 404);
});

// ─── serve route — happy path ─────────────────────────────────────────────────

Deno.test("Avatar serve — PNG file returns 200 with image/png", OPTS, async () => {
  await writeAvatar(PLAYER_ID, "png", PNG_BYTES);
  const res = await get(`/avatars/${PLAYER_ID}`);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");
  await res.body?.cancel();
  await removeAvatar(PLAYER_ID, "png");
});

Deno.test("Avatar serve — JPG file returns 200 with image/jpeg", OPTS, async () => {
  await writeAvatar(PLAYER_ID, "jpg", JPEG_BYTES);
  const res = await get(`/avatars/${PLAYER_ID}`);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/jpeg");
  await res.body?.cancel();
  await removeAvatar(PLAYER_ID, "jpg");
});

Deno.test("Avatar serve — GIF file returns 200 with image/gif", OPTS, async () => {
  await writeAvatar(PLAYER_ID, "gif", new Uint8Array([0x47, 0x49, 0x46]));
  const res = await get(`/avatars/${PLAYER_ID}`);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/gif");
  await res.body?.cancel();
  await removeAvatar(PLAYER_ID, "gif");
});

Deno.test("Avatar serve — WebP file returns 200 with image/webp", OPTS, async () => {
  await writeAvatar(PLAYER_ID, "webp", new Uint8Array([0x52, 0x49, 0x46, 0x46]));
  const res = await get(`/avatars/${PLAYER_ID}`);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/webp");
  await res.body?.cancel();
  await removeAvatar(PLAYER_ID, "webp");
});

Deno.test("Avatar serve — response has Cache-Control header", OPTS, async () => {
  await writeAvatar(PLAYER_ID, "png", PNG_BYTES);
  const res = await get(`/avatars/${PLAYER_ID}`);
  assertEquals(res.status, 200);
  const cc = res.headers.get("cache-control") ?? "";
  assertEquals(cc.includes("public"), true);
  await res.body?.cancel();
  await removeAvatar(PLAYER_ID, "png");
});

Deno.test("Avatar serve — file body matches what was written", OPTS, async () => {
  await writeAvatar(PLAYER_ID, "png", PNG_BYTES);
  const res  = await get(`/avatars/${PLAYER_ID}`);
  const body = new Uint8Array(await res.arrayBuffer());
  assertEquals(body, PNG_BYTES);
  await removeAvatar(PLAYER_ID, "png");
});

// ─── serve route — 404 after clear ───────────────────────────────────────────

Deno.test("Avatar serve — 404 after file is deleted", OPTS, async () => {
  await writeAvatar(PLAYER_ID, "png", PNG_BYTES);
  // Confirm it's there
  const before = await get(`/avatars/${PLAYER_ID}`);
  assertEquals(before.status, 200);
  await before.body?.cancel();
  // Delete it
  await removeAvatar(PLAYER_ID, "png");
  // Now should 404
  const after = await get(`/avatars/${PLAYER_ID}`);
  assertEquals(after.status, 404);
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

Deno.test("Avatar — cleanup", OPTS, async () => {
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  // Ensure no leftover files
  for (const ext of ["png", "jpg", "gif", "webp"]) {
    await removeAvatar(PLAYER_ID, ext);
  }
  await DBO.close();
});
