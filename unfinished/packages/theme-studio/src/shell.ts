/**
 * Resolve @ursamu/site public/ shell for canvas + preview.
 */

import { dirname, fromFileUrl, join, resolve } from "@std/path";
import { ensureDir, existsSync } from "@std/fs";

const HERE = dirname(fromFileUrl(import.meta.url));
const PKG = resolve(HERE, "..");
const CACHE = join(PKG, ".preview-shell");

const SHELL_BASE =
  "https://raw.githubusercontent.com/UrsaMU/ursamu";

export const SHELL_FILES = [
  "index.html",
  "css/reset.css",
  "css/tokens.css",
  "css/layout.css",
  "css/components.css",
  "css/play.css",
  "css/skins/default.css",
  "js/site.js",
] as const;

export function looksLikePublic(dir: string): boolean {
  return existsSync(join(dir, "index.html")) &&
    existsSync(join(dir, "js", "site.js")) &&
    existsSync(join(dir, "css", "layout.css"));
}

async function downloadShell(ref: string): Promise<string> {
  await ensureDir(CACHE);
  const base = `${SHELL_BASE}/${ref}/packages/site/public`;
  console.log(`Downloading @ursamu/site shell (${ref})…`);
  for (const rel of SHELL_FILES) {
    const url = `${base}/${rel}`;
    const out = join(CACHE, rel);
    await ensureDir(dirname(out));
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed ${url}: HTTP ${res.status}`);
    }
    const data = new Uint8Array(await res.arrayBuffer());
    await Deno.writeFile(out, data);
    console.log(`  + ${rel} (${data.byteLength} B)`);
  }
  await Deno.writeTextFile(
    join(CACHE, ".ref"),
    `${ref}\n${new Date().toISOString()}\n`,
  );
  return CACHE;
}

export type ShellResolve = {
  dir: string;
  source: string;
};

export async function resolveShell(opts: {
  shell?: string;
  ref?: string;
  refresh?: boolean;
}): Promise<ShellResolve> {
  const ref = opts.ref ?? "main";

  if (opts.shell) {
    const dir = resolve(opts.shell);
    if (!looksLikePublic(dir)) {
      throw new Error(`Not a site public/ dir: ${dir}`);
    }
    return { dir, source: "flag" };
  }

  const env = Deno.env.get("URSAMU_SITE_PUBLIC")?.trim();
  if (env) {
    const dir = resolve(env);
    if (!looksLikePublic(dir)) {
      throw new Error(`URSAMU_SITE_PUBLIC invalid: ${dir}`);
    }
    return { dir, source: "env" };
  }

  // monorepo: packages/theme-studio → packages/site/public
  const mono = resolve(PKG, "../site/public");
  if (looksLikePublic(mono)) {
    return { dir: mono, source: "monorepo" };
  }

  if (!opts.refresh && looksLikePublic(CACHE)) {
    return { dir: CACHE, source: "cache" };
  }

  const dir = await downloadShell(ref);
  return { dir, source: `github@${ref}` };
}

export function packageRoot(): string {
  return PKG;
}
