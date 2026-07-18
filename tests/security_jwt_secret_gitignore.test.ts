/**
 * [CRITICAL] .jwt_secret must not be tracked by git.
 *
 * The HMAC secret used to sign player JWTs was committed to the repo.
 * Anyone with clone access can forge tokens for any user id.
 *
 * RED:   .jwt_secret is tracked / not gitignored.
 * GREEN: .gitignore lists .jwt_secret and git check-ignore succeeds.
 */
import { assertEquals, assert } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOT = new URL("../", import.meta.url).pathname;

Deno.test(
  "[C2] .gitignore lists .jwt_secret",
  OPTS,
  async () => {
    const gi = await Deno.readTextFile(`${ROOT}.gitignore`);
    const lines = gi.split("\n").map((l) => l.trim());
    assert(
      lines.includes(".jwt_secret"),
      ".gitignore must contain a line '.jwt_secret'",
    );
  },
);

Deno.test(
  "[C2] git check-ignore accepts .jwt_secret",
  OPTS,
  async () => {
    const cmd = new Deno.Command("git", {
      args: ["check-ignore", "-q", ".jwt_secret"],
      cwd: ROOT,
    });
    const { code } = await cmd.output();
    assertEquals(
      code,
      0,
      "git check-ignore must exit 0 for .jwt_secret",
    );
  },
);

Deno.test(
  "[C2] .jwt_secret is not in the git index",
  OPTS,
  async () => {
    const cmd = new Deno.Command("git", {
      args: ["ls-files", "--error-unmatch", ".jwt_secret"],
      cwd: ROOT,
      stdout: "null",
      stderr: "null",
    });
    const { code } = await cmd.output();
    assertEquals(
      code,
      1,
      ".jwt_secret must not be tracked (git ls-files --error-unmatch exits 1)",
    );
  },
);
