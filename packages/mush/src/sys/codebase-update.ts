/**
 * In-process codebase update: git pull, bump jsr:@ursamu/* pins,
 * deno cache --reload. Soft reboot (exit 75) is left to the caller so
 * telnet can keep sessions across main-loop restart.
 */

import {
  bumpUrsamuImports,
  fetchLatestJsrVersion,
} from "./jsr-pins.ts";

export type UpdateLog = (line: string) => void;

export type UpdateOptions = {
  branch?: string;
  cwd?: string;
  log?: UpdateLog;
  /** Override fetch for tests. */
  fetchMeta?: (pkg: string) => Promise<string | null>;
  /** Skip network/git (tests). */
  dryRun?: boolean;
};

export type UpdateOutcome = {
  ok: boolean;
  lines: string[];
  bumped: string[];
  pulled: boolean;
};

export {
  bumpUrsamuImports,
  formatJsrPin,
  parseJsrSpec,
} from "./jsr-pins.ts";

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

  const fetch = await runCmd(cwd, "git", ["fetch", "--all", "--prune"]);
  if (!fetch.ok) {
    logLine(
      lines,
      log,
      `git fetch failed: ${fetch.err || fetch.out}`,
    );
    return false;
  }

  const args = branch
    ? ["pull", "--ff-only", "origin", branch]
    : ["pull", "--ff-only"];
  const pull = await runCmd(cwd, "git", args);
  const msg = pull.out || pull.err || "Already up to date.";
  if (!pull.ok) {
    logLine(lines, log, `git pull failed: ${msg}`);
    return false;
  }
  logLine(lines, log, msg);
  return true;
}

async function writeBumpedDenoJson(
  cwd: string,
  lines: string[],
  log: UpdateLog | undefined,
  fetchMeta: (pkg: string) => Promise<string | null>,
): Promise<string[]> {
  const path = `${cwd}/deno.json`;
  let raw: string;
  try {
    raw = await Deno.readTextFile(path);
  } catch {
    logLine(lines, log, "No deno.json — skip JSR bump.");
    return [];
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
    return [];
  }

  if (!data.imports || typeof data.imports !== "object") {
    logLine(lines, log, "deno.json has no imports map.");
    return [];
  }

  const { imports, bumped } = await bumpUrsamuImports(
    data.imports,
    fetchMeta,
  );
  let dirty = bumped.length > 0;
  data.imports = imports;

  if (data.minimumDependencyAge !== 0) {
    data.minimumDependencyAge = 0;
    dirty = true;
    logLine(lines, log, "Set minimumDependencyAge = 0");
  }

  if (dirty) {
    await Deno.writeTextFile(
      path,
      JSON.stringify(data, null, 2) + "\n",
    );
    for (const b of bumped) logLine(lines, log, b);
    if (bumped.length === 0) {
      logLine(lines, log, "Updated deno.json");
    }
  } else {
    logLine(lines, log, "JSR @ursamu/* pins already current.");
  }
  return bumped;
}

async function denoCacheReload(
  cwd: string,
  lines: string[],
  log?: UpdateLog,
): Promise<boolean> {
  const entries = ["src/main.ts", "src/telnet.ts", "mod.ts"];
  const found: string[] = [];
  for (const e of entries) {
    try {
      await Deno.stat(`${cwd}/${e}`);
      found.push(e);
    } catch {
      /* missing */
    }
  }
  if (!found.length) {
    logLine(lines, log, "No entrypoints to cache.");
    return true;
  }

  logLine(lines, log, `deno cache --reload ${found.join(" ")}`);
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
  logLine(lines, log, "Cache refreshed.");
  return true;
}

/** Run pull → JSR bump → cache. Does not reboot. */
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
    return { ok: true, lines, bumped: [], pulled: false };
  }

  logLine(lines, log, "Pulling latest code...");
  const pulled = await gitPull(cwd, branch, lines, log);
  if (!pulled) {
    return { ok: false, lines, bumped: [], pulled: false };
  }

  logLine(lines, log, "Checking JSR @ursamu/* pins...");
  const bumped = await writeBumpedDenoJson(
    cwd,
    lines,
    log,
    fetchMeta,
  );

  const cached = await denoCacheReload(cwd, lines, log);
  if (!cached) {
    return { ok: false, lines, bumped, pulled: true };
  }

  logLine(lines, log, "Update complete.");
  return { ok: true, lines, bumped, pulled: true };
}
