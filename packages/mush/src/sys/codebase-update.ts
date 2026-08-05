/**
 * In-process codebase update: git pull, bump jsr:@ursamu/* pins,
 * deno cache --reload. Soft reboot (exit 75) is left to the caller so
 * telnet can keep sessions across main-loop restart.
 */

import {
  bumpUrsamuImports,
  fetchLatestJsrVersion,
  isAppImportKey,
} from "./jsr-pins.ts";
import { applyConfigSampleMerge } from "./merge-config.ts";

export type UpdateLog = (line: string) => void;

export type UpdateOptions = {
  branch?: string;
  cwd?: string;
  log?: UpdateLog;
  /** Override fetch for tests. */
  fetchMeta?: (pkg: string) => Promise<string | null>;
  /** Skip network/git (tests). */
  dryRun?: boolean;
  /**
   * Report outdated pins only — no git write, no cache, no reboot.
   * Safe to run on a live game.
   */
  checkOnly?: boolean;
};

export type UpdateOutcome = {
  ok: boolean;
  lines: string[];
  bumped: string[];
  pulled: boolean;
  /** True when deno cache finished successfully (safe to soft-reboot). */
  cached?: boolean;
};

export {
  applyEngineOverrides,
  bumpUrsamuImports,
  formatJsrPin,
  isAppImportKey,
  parseJsrSpec,
  rangeVersion,
} from "./jsr-pins.ts";

export {
  applyConfigSampleMerge,
  deepMerge,
  ensurePluginsList,
  mergeConfigFromSample,
} from "./merge-config.ts";

function logLine(
  lines: string[],
  log: UpdateLog | undefined,
  msg: string,
): void {
  lines.push(msg);
  log?.(msg);
}

async function runCmd(
  cwd: string,
  bin: string,
  args: string[],
): Promise<{ ok: boolean; out: string; err: string; code: number }> {
  const proc = await new Deno.Command(bin, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return {
    ok: proc.success,
    out: dec.decode(proc.stdout).trim(),
    err: dec.decode(proc.stderr).trim(),
    code: proc.code,
  };
}

function cmdText(r: { out: string; err: string }): string {
  return [r.out, r.err].filter(Boolean).join("\n").trim();
}

async function gitPull(
  cwd: string,
  branch: string,
  lines: string[],
  log?: UpdateLog,
): Promise<boolean> {
  const inside = await runCmd(cwd, "git", [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  if (!inside.ok || inside.out !== "true") {
    logLine(lines, log, "Not a git checkout — skip pull.");
    return true;
  }

  if (branch) {
    if (!/^[\w./-]+$/.test(branch) || branch.startsWith("-")) {
      logLine(lines, log, `Invalid branch name: "${branch}"`);
      return false;
    }
  }

  // Local edits (often deno.json from a prior JSR bump) block
  // --ff-only. Stash tracked changes, pull, then restore.
  const porcelain = await runCmd(cwd, "git", [
    "status",
    "--porcelain",
  ]);
  let stashed = false;
  if (porcelain.ok && porcelain.out.trim()) {
    // Quiet — stash is routine when deno.json was bumped last time.
    const stash = await runCmd(cwd, "git", [
      "stash",
      "push",
      "-m",
      "ursamu-@restart-auto",
    ]);
    if (!stash.ok) {
      logLine(
        lines,
        log,
        `git stash failed: ${cmdText(stash)}`,
      );
      return false;
    }
    stashed = true;
  }

  const fetch = await runCmd(cwd, "git", ["fetch", "--all", "--prune"]);
  if (!fetch.ok) {
    logLine(
      lines,
      log,
      `git fetch failed: ${cmdText(fetch)}`,
    );
    if (stashed) {
      await runCmd(cwd, "git", ["stash", "pop"]);
    }
    return false;
  }

  const args = branch
    ? ["pull", "--ff-only", "origin", branch]
    : ["pull", "--ff-only"];
  const pull = await runCmd(cwd, "git", args);
  const msg = cmdText(pull) || "Already up to date.";
  if (!pull.ok) {
    logLine(lines, log, `git pull failed: ${msg}`);
    if (stashed) {
      const pop = await runCmd(cwd, "git", ["stash", "pop"]);
      if (!pop.ok) {
        logLine(
          lines,
          log,
          `stash pop after failed pull: ${cmdText(pop)}`,
        );
      }
    }
    return false;
  }
  // Only speak when git actually moved HEAD (skip "Already up to date.").
  const summary = pull.out.trim();
  const upToDate = !summary ||
    /already up to date/i.test(summary) ||
    /already up to date/i.test(pull.err);
  if (!upToDate) {
    logLine(lines, log, summary);
  }

  if (stashed) {
    const pop = await runCmd(cwd, "git", ["stash", "pop"]);
    if (!pop.ok) {
      logLine(
        lines,
        log,
        `stash pop conflicts (resolve manually): ${cmdText(pop)}`,
      );
      // Code was pulled; continue update rather than abort.
    }
    // Quiet success — restoring local deno.json is expected.
  }
  return true;
}

async function writeBumpedDenoJson(
  cwd: string,
  lines: string[],
  log: UpdateLog | undefined,
  fetchMeta: (pkg: string) => Promise<string | null>,
): Promise<{ bumped: string[]; resolved: Map<string, string> }> {
  const path = `${cwd}/deno.json`;
  let raw: string;
  try {
    raw = await Deno.readTextFile(path);
  } catch {
    logLine(lines, log, "No deno.json — skip JSR bump.");
    return { bumped: [], resolved: new Map() };
  }

  let data: {
    imports?: Record<string, string>;
    minimumDependencyAge?: number | string;
    [k: string]: unknown;
  };
  try {
    data = JSON.parse(raw);
  } catch {
    logLine(lines, log, "deno.json is not valid JSON.");
    return { bumped: [], resolved: new Map() };
  }

  if (!data.imports || typeof data.imports !== "object") {
    logLine(lines, log, "deno.json has no imports map.");
    return { bumped: [], resolved: new Map() };
  }

  const before = JSON.stringify(data.imports);
  // Exact pins on prepare so lock cannot keep an older caret resolve.
  const { imports, bumped, resolved } = await bumpUrsamuImports(
    data.imports,
    fetchMeta,
    { exact: true },
  );
  data.imports = imports;
  let dirty = JSON.stringify(data.imports) !== before ||
    bumped.length > 0;

  if (data.minimumDependencyAge !== 0) {
    data.minimumDependencyAge = 0;
    dirty = true;
    logLine(lines, log, "Set minimumDependencyAge = 0");
  }

  // Note local vendor pins — only git pull updates those.
  for (const [key, val] of Object.entries(imports)) {
    if (!isAppImportKey(key)) continue;
    if (
      typeof val === "string" &&
      (val.startsWith("./") || val.startsWith("../"))
    ) {
      logLine(
        lines,
        log,
        `${key} → local ${val} (git only, not JSR)`,
      );
    }
  }

  if (dirty) {
    await Deno.writeTextFile(
      path,
      JSON.stringify(data, null, 2) + "\n",
    );
    for (const b of bumped) logLine(lines, log, b);
  } else if (resolved.size) {
    logLine(lines, log, "JSR pins already at latest (exact).");
  }
  return { bumped, resolved };
}

/** Drop lock + node_modules so the next cache cannot reuse stale graphs. */
async function purgeStaleResolutions(
  cwd: string,
  lines: string[],
  log?: UpdateLog,
): Promise<void> {
  for (const rel of ["deno.lock", "node_modules"]) {
    const p = `${cwd}/${rel}`;
    try {
      await Deno.remove(p, { recursive: true });
      logLine(lines, log, `Cleared ${rel} for fresh resolve.`);
    } catch (e: unknown) {
      if (e instanceof Deno.errors.NotFound) continue;
      // best-effort — cache may still succeed
    }
  }
}

function entrypoints(cwd: string): Promise<string[]> {
  const entries = ["src/main.ts", "src/telnet.ts", "mod.ts"];
  return (async () => {
    const found: string[] = [];
    for (const e of entries) {
      try {
        await Deno.stat(`${cwd}/${e}`);
        found.push(e);
      } catch {
        /* missing */
      }
    }
    return found;
  })();
}

async function denoCacheReload(
  cwd: string,
  lines: string[],
  log?: UpdateLog,
): Promise<boolean> {
  const found = await entrypoints(cwd);
  if (!found.length) return true;

  // Always purge lock/node_modules so soft-reboot cannot boot an old
  // graph after pins moved (or after a same-version republish attempt).
  await purgeStaleResolutions(cwd, lines, log);

  const r = await runCmd(cwd, Deno.execPath(), [
    "cache",
    "--reload",
    "--minimum-dependency-age=0",
    ...found,
  ]);
  if (!r.ok) {
    logLine(
      lines,
      log,
      `deno cache failed: ${r.err || r.out || r.code}`,
    );
    return false;
  }
  return true;
}

/** Read jsr:@ursamu/* versions locked after cache (for admin feedback). */
async function reportLockedUrsamu(
  cwd: string,
  lines: string[],
  log?: UpdateLog,
): Promise<void> {
  try {
    const raw = await Deno.readTextFile(`${cwd}/deno.lock`);
    const lock = JSON.parse(raw) as {
      specifiers?: Record<string, string>;
      packages?: { jsr?: Record<string, unknown> };
    };
    const specs = lock.specifiers ?? {};
    const rows: string[] = [];
    for (const [spec, ver] of Object.entries(specs)) {
      if (!spec.includes("@ursamu/")) continue;
      // jsr:@ursamu/foo@^1.2.3 → 1.2.4
      const name = spec.replace(/^jsr:/, "").replace(/@[^@]*$/, "");
      rows.push(`${name}@${ver}`);
    }
    rows.sort();
    // De-dupe by package name (keep last = usually exact).
    const byPkg = new Map<string, string>();
    for (const r of rows) {
      const i = r.lastIndexOf("@");
      const pkg = r.slice(0, i);
      const ver = r.slice(i + 1);
      byPkg.set(pkg, ver);
    }
    if (byPkg.size === 0) return;
    logLine(lines, log, "Resolved @ursamu packages:");
    for (const [pkg, ver] of [...byPkg.entries()].sort()) {
      logLine(lines, log, `  ${pkg}@${ver}`);
    }
  } catch {
    /* lock optional */
  }
}

/**
 * Prepare an update while the game stays online:
 *   git pull → exact JSR pins + dual-package overrides →
 *   purge lock/node_modules → deno cache --reload
 * Does NOT reboot. Caller soft-reboots only when ok && cached.
 */
export async function runCodebaseUpdate(
  opts: UpdateOptions = {},
): Promise<UpdateOutcome> {
  const cwd = opts.cwd ?? Deno.cwd();
  const lines: string[] = [];
  const log = opts.log;
  const branch = (opts.branch ?? "").trim();
  const fetchMeta = opts.fetchMeta ?? fetchLatestJsrVersion;

  if (opts.dryRun) {
    logLine(lines, log, "dry-run: skip git/network.");
    return { ok: true, lines, bumped: [], pulled: false, cached: false };
  }

  if (opts.checkOnly) {
    // Read-only: report pins behind latest; never write or reboot.
    try {
      const raw = await Deno.readTextFile(`${cwd}/deno.json`);
      const data = JSON.parse(raw) as {
        imports?: Record<string, string>;
      };
      const imports = data.imports ?? {};
      const { bumped } = await bumpUrsamuImports(
        imports,
        fetchMeta,
        { exact: true },
      );
      if (bumped.length === 0) {
        logLine(
          lines,
          log,
          "All jsr:@ursamu/* app pins match JSR latest.",
        );
      } else {
        logLine(
          lines,
          log,
          "Outdated pins (run @restart to apply):",
        );
        for (const b of bumped) logLine(lines, log, `  ${b}`);
      }
      // Vendor reminder
      for (const [key, val] of Object.entries(imports)) {
        if (
          typeof val === "string" &&
          (val.startsWith("./") || val.startsWith("../"))
        ) {
          logLine(
            lines,
            log,
            `  ${key} is local (${val}) — update via git.`,
          );
        }
      }
      return {
        ok: true,
        lines,
        bumped,
        pulled: false,
        cached: false,
      };
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      logLine(lines, log, `check failed: ${m}`);
      return {
        ok: false,
        lines,
        bumped: [],
        pulled: false,
        cached: false,
      };
    }
  }

  // --- live prepare (game keeps serving) ---------------------------------
  const pulled = await gitPull(cwd, branch, lines, log);
  if (!pulled) {
    return {
      ok: false,
      lines,
      bumped: [],
      pulled: false,
      cached: false,
    };
  }

  // Live config is often gitignored — pull new plugins/settings from sample.
  try {
    const cfg = await applyConfigSampleMerge(cwd);
    if (cfg.wrote) {
      if (cfg.addedPlugins.length) {
        logLine(
          lines,
          log,
          `config plugins added: ${cfg.addedPlugins.join(", ")}`,
        );
      }
      if (cfg.mergedBlocks.length) {
        logLine(
          lines,
          log,
          `config plugins.* merged: ${cfg.mergedBlocks.join(", ")}`,
        );
      }
      if (!cfg.addedPlugins.length && !cfg.mergedBlocks.length) {
        logLine(lines, log, "config.json updated from sample.");
      }
    }
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    logLine(lines, log, `config merge warning: ${m}`);
    // Non-fatal — pins/cache may still succeed.
  }

  const { bumped } = await writeBumpedDenoJson(
    cwd,
    lines,
    log,
    fetchMeta,
  );

  // Pre-warm cache while old main still runs — reboot only after this.
  const cached = await denoCacheReload(cwd, lines, log);
  if (!cached) {
    logLine(
      lines,
      log,
      "Cache failed — game left running on previous packages.",
    );
    return { ok: false, lines, bumped, pulled: true, cached: false };
  }

  await reportLockedUrsamu(cwd, lines, log);
  logLine(
    lines,
    log,
    "Update ready (fresh lock + cache). Soft-reboot to load.",
  );
  return { ok: true, lines, bumped, pulled: true, cached: true };
}
