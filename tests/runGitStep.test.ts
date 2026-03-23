/**
 * Unit tests for runGitStep() — the startup-hang fix in ensurePlugins.ts.
 *
 * Coverage:
 *   [SUCCESS]  Command exits 0  → { success: true, stderr: "" }
 *   [FAILURE]  Command exits non-0  → { success: false, stderr: <text> }
 *   [TIMEOUT]  Command hangs past timeoutMs  → { success: false, stderr: "timed out…" }
 *   [KILL]     Timed-out child is killed (does not outlive the test)
 *   [NODANGLE] stderrText Promise has no dangling rejection after kill (M1 fix)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { runGitStep } from "../src/utils/ensurePlugins.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const env  = { PATH: Deno.env.get("PATH") ?? "" };

// ─── Success path ─────────────────────────────────────────────────────────────

Deno.test("[SUCCESS] runGitStep — command exits 0 → success: true", OPTS, async () => {
  // `true` is a shell builtin that exits 0; use `sh -c true` for portability
  const result = await runGitStep(
    ["-c", "true"],
    env,
    { timeoutMs: 5_000, cmd: "sh" },
  );
  assertEquals(result.success, true);
});

Deno.test("[SUCCESS] runGitStep — captures stderr text on success", OPTS, async () => {
  const result = await runGitStep(
    ["-c", "echo 'hello stderr' >&2"],
    env,
    { timeoutMs: 5_000, cmd: "sh" },
  );
  assertEquals(result.success, true);
  assertStringIncludes(result.stderr, "hello stderr");
});

// ─── Failure path ─────────────────────────────────────────────────────────────

Deno.test("[FAILURE] runGitStep — command exits non-0 → success: false", OPTS, async () => {
  const result = await runGitStep(
    ["-c", "exit 1"],
    env,
    { timeoutMs: 5_000, cmd: "sh" },
  );
  assertEquals(result.success, false);
});

Deno.test("[FAILURE] runGitStep — captures stderr on failure", OPTS, async () => {
  const result = await runGitStep(
    ["-c", "echo 'clone failed' >&2; exit 128"],
    env,
    { timeoutMs: 5_000, cmd: "sh" },
  );
  assertEquals(result.success, false);
  assertStringIncludes(result.stderr, "clone failed");
});

// ─── Timeout path (M1 + L1) ───────────────────────────────────────────────────

Deno.test("[TIMEOUT] runGitStep — hanging command → failure within timeout window", OPTS, async () => {
  // sleep 30 simulates a git clone that hangs (DNS stall, GitHub down, etc.)
  const before = Date.now();
  const result = await runGitStep(
    ["-c", "sleep 30"],
    env,
    { timeoutMs: 200, cmd: "sh" },
  );
  const elapsed = Date.now() - before;

  assertEquals(result.success, false,       "must return failure when timeout fires");
  assertStringIncludes(result.stderr, "timed out", "stderr must describe the timeout");
  assertEquals(
    elapsed < 1_000,
    true,
    `elapsed ${elapsed}ms — timeout did not fire within expected window`,
  );
});

Deno.test("[KILL] runGitStep — timed-out child is killed, not left running", OPTS, async () => {
  // Write child PID to a temp file; after timeout, the PID must not be alive.
  const pidFile = await Deno.makeTempFile({ prefix: "ursamu-test-pid-" });
  try {
    await runGitStep(
      ["-c", `echo $$ > ${pidFile}; sleep 30`],
      env,
      { timeoutMs: 200, cmd: "sh" },
    );

    // Give the OS a moment to clean up
    await new Promise(r => setTimeout(r, 100));

    const pidText = (await Deno.readTextFile(pidFile)).trim();
    const pid     = parseInt(pidText, 10);

    // Sending signal 0 checks if the process exists without killing it.
    // If it throws "No such process", the kill worked.
    let stillAlive = false;
    try {
      // Deno doesn't expose kill(pid, 0) directly — use `kill -0` via shell
      const check = await new Deno.Command("sh", {
        args: ["-c", `kill -0 ${pid} 2>/dev/null`],
        stdout: "null", stderr: "null",
      }).output();
      stillAlive = check.success;
    } catch { stillAlive = false; }

    assertEquals(stillAlive, false, `Child PID ${pid} should have been killed`);
  } finally {
    await Deno.remove(pidFile).catch(() => {});
  }
});

Deno.test("[NODANGLE] runGitStep — stderrText Promise has no unhandled rejection after timeout kill", OPTS, async () => {
  // Capture any unhandledrejection events during this test.
  const rejections: PromiseRejectionEvent[] = [];
  const handler = (e: PromiseRejectionEvent) => { e.preventDefault(); rejections.push(e); };
  globalThis.addEventListener("unhandledrejection", handler);

  try {
    await runGitStep(
      ["-c", "sleep 30"],
      env,
      { timeoutMs: 150, cmd: "sh" },
    );

    // Small grace period to let any async side-effects surface
    await new Promise(r => setTimeout(r, 200));

    assertEquals(
      rejections.length,
      0,
      `Unexpected unhandled rejections: ${rejections.map(r => r.reason).join(", ")}`,
    );
  } finally {
    globalThis.removeEventListener("unhandledrejection", handler);
  }
});
