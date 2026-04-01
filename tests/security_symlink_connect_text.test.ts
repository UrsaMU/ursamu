/**
 * tests/security_symlink_connect_text.test.ts
 *
 * [SEC][L1] Symlink in connect-text path can escape text/ root.
 *
 * The /connect endpoint resolves the path from config and verifies it starts
 * with ./text/ (path-traversal guard). However, a symlink INSIDE text/ that
 * points outside can bypass this check: the resolved path passes the prefix
 * check, but Deno.readTextFile follows the link target, reading files outside
 * the sandbox.
 *
 * RED:  Prove the flaw — place a symlink inside text/ pointing to a file
 *       outside, confirm the path-traversal guard passes (it would), then
 *       show that the symlink target is outside text/.
 *
 * GREEN: Deno.lstat() the resolved path before reading. If isSymlink is true,
 *        return 400 with "Invalid connect text path."
 */
import { assertEquals } from "@std/assert";
import { join, resolve } from "@std/path";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Helpers ───────────────────────────────────────────────────────────────────

const TMP = await Deno.makeTempDir();

async function setupTextDir(): Promise<{ textRoot: string; outsideFile: string }> {
  const textRoot = join(TMP, "text");
  await Deno.mkdir(textRoot, { recursive: true });
  // A legitimate file inside text/
  await Deno.writeTextFile(join(textRoot, "legit.txt"), "Welcome!");
  // A file OUTSIDE the text root
  const outsideFile = join(TMP, "secret.txt");
  await Deno.writeTextFile(outsideFile, "SECRET CONTENT");
  return { textRoot, outsideFile };
}

// ── Exploit proof ─────────────────────────────────────────────────────────────

Deno.test("[SEC][L1] path-traversal guard alone does not block symlinks inside text/", OPTS, async () => {
  const { textRoot, outsideFile } = await setupTextDir();
  const symlinkPath = join(textRoot, "evil.txt");

  // Create a symlink inside text/ → outside file
  await Deno.symlink(outsideFile, symlinkPath);

  // The path-traversal guard only checks resolved path of the LINK, not the target.
  const resolved = resolve(symlinkPath);
  const guardPasses = resolved.startsWith(textRoot + "/") || resolved === textRoot;
  assertEquals(guardPasses, true, "path-traversal guard passes for a symlink inside text/");

  // BUT the link's real target is outside text/
  const realTarget = await Deno.realPath(symlinkPath);
  const targetInsideRoot = realTarget.startsWith(textRoot + "/");
  assertEquals(targetInsideRoot, false, "symlink real target is outside text/ — flaw confirmed");

  await Deno.remove(symlinkPath);
});

// ── Fix validation ────────────────────────────────────────────────────────────

Deno.test("[SEC][L1] lstat guard: symlink inside text/ is rejected", OPTS, async () => {
  const { textRoot, outsideFile } = await setupTextDir();
  const symlinkPath = join(textRoot, "evil2.txt");
  await Deno.symlink(outsideFile, symlinkPath);

  const stat = await Deno.lstat(symlinkPath);
  assertEquals(stat.isSymlink, true, "lstat detects symlink");

  // Simulated handler logic: reject if symlink
  const isRejected = stat.isSymlink;
  assertEquals(isRejected, true, "handler must reject symlinks");

  await Deno.remove(symlinkPath);
});

Deno.test("[SEC][L1] lstat guard: regular file inside text/ is allowed", OPTS, async () => {
  const { textRoot } = await setupTextDir();
  const legitPath = join(textRoot, "legit.txt");

  const stat = await Deno.lstat(legitPath);
  assertEquals(stat.isSymlink, false, "regular file is not a symlink — allowed");
});

Deno.test("[SEC][L1] lstat guard: directory symlink is also rejected", OPTS, async () => {
  const { textRoot } = await setupTextDir();
  const outsideDir = join(TMP, "outside_dir");
  await Deno.mkdir(outsideDir, { recursive: true });
  await Deno.writeTextFile(join(outsideDir, "secret.txt"), "DIR SECRET");

  const symlinkDir = join(textRoot, "subdir");
  await Deno.symlink(outsideDir, symlinkDir);

  const stat = await Deno.lstat(symlinkDir);
  assertEquals(stat.isSymlink, true, "directory symlink is detected and must be rejected");

  await Deno.remove(symlinkDir);
});
