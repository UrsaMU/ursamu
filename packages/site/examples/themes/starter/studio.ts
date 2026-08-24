/**
 * Launch UrsaMU Theme Studio against this theme package (Phase 2).
 *
 *   deno task studio
 *   deno task studio -- --port 4301
 *
 * Resolves Theme Studio from, in order:
 *   1. URSAMU_THEME_STUDIO
 *   2. monorepo packages/theme-studio
 *   3. sibling ../theme-studio
 *   4. .theme-studio/ cache (auto-download from GitHub)
 */

import {
  dirname,
  fromFileUrl,
  join,
  resolve,
} from "jsr:@std/path@^1.0.0";
import { ensureDir, existsSync } from "jsr:@std/fs@^1.0.0";
import { unzipSync } from "npm:fflate@0.8.2";

const THEME = resolve(dirname(fromFileUrl(import.meta.url)));
const CACHE = join(THEME, ".theme-studio");
const GH_ZIP =
  "https://github.com/UrsaMU/theme-studio/archive/refs/heads/main.zip";

function looksLikeStudio(dir: string): boolean {
  return existsSync(join(dir, "server.ts")) &&
    existsSync(join(dir, "public", "index.html"));
}

async function downloadStudio(): Promise<string> {
  console.log("Downloading UrsaMU/theme-studio…");
  const res = await fetch(GH_ZIP);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(buf) as Record<string, Uint8Array>;
  await ensureDir(CACHE);

  for (const [name, data] of Object.entries(files)) {
    const norm = name.replace(/\\/g, "/");
    if (norm.endsWith("/")) continue;
    const parts = norm.split("/");
    const rel = parts.slice(1).join("/");
    if (!rel || rel.includes("..")) continue;
    const out = join(CACHE, rel);
    await ensureDir(dirname(out));
    await Deno.writeFile(out, data);
  }
  if (!looksLikeStudio(CACHE)) {
    throw new Error("Downloaded archive missing server.ts");
  }
  console.log(`  cached → ${CACHE}`);
  return CACHE;
}

async function resolveStudio(): Promise<{ dir: string; source: string }> {
  const env = Deno.env.get("URSAMU_THEME_STUDIO")?.trim();
  if (env && looksLikeStudio(resolve(env))) {
    return { dir: resolve(env), source: "env" };
  }

  // packages/site/examples/themes/skeleton → packages/theme-studio
  const mono = resolve(THEME, "../../../../theme-studio");
  if (looksLikeStudio(mono)) {
    return { dir: mono, source: "monorepo" };
  }

  const sibling = resolve(THEME, "../theme-studio");
  if (looksLikeStudio(sibling)) {
    return { dir: sibling, source: "sibling" };
  }

  if (looksLikeStudio(CACHE)) {
    return { dir: CACHE, source: "cache" };
  }

  const dir = await downloadStudio();
  return { dir, source: "github" };
}

const studio = await resolveStudio();
const passthrough = [...Deno.args];

// Avoid double --open if user passed flags only
const hasOpen = passthrough.includes("--open") ||
  passthrough.includes("-o");

console.log(`Theme:   ${THEME}`);
console.log(`Studio:  ${studio.dir} (${studio.source})`);

const monoPublic = resolve(THEME, "../../../../site/public");
const env: Record<string, string> = { ...Deno.env.toObject() };
if (existsSync(join(monoPublic, "index.html"))) {
  env.URSAMU_SITE_PUBLIC = monoPublic;
}

const cmd = new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "-A",
    join(studio.dir, "server.ts"),
    "--theme",
    THEME,
    ...(hasOpen ? [] : ["--open"]),
    ...passthrough,
  ],
  cwd: studio.dir,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env,
});

const { code } = await cmd.output();
Deno.exit(code);
