import * as dpath from "@std/path";
import { listLangs } from "./langStore.ts";

const SRC_FILES = ["schema.ts", "rng.ts", "phonemes.ts", "garble.ts"] as const;

function stripModuleSyntax(src: string): string {
  return src
    .replace(/^import\s+[^;]*;?\s*$/gm, "")
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|interface|type|enum|class))/gm, "")
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, "");
}

export async function buildGarbleSnippet(): Promise<string> {
  const srcDir = dpath.fromFileUrl(new URL("./", import.meta.url));
  const parts: string[] = [
    "// ─── sgp-language inlined garble engine (do not edit; baked from src/) ───",
  ];
  for (const f of SRC_FILES) {
    const raw = await Deno.readTextFile(dpath.join(srcDir, f));
    parts.push(`// ── ${f} ──`, stripModuleSyntax(raw).trim());
  }
  parts.push("// ─── end inlined garble engine ────────────────────────────────────────────");
  return parts.join("\n\n") + "\n";
}

export function buildLangDefsSnippet(): string {
  const defs: Record<string, unknown> = {};
  for (const def of listLangs()) defs[def.name.toLowerCase()] = def;
  return `// ─── sgp-language baked language defs (regenerated on +language/reload) ───
const LANG_DEFS = ${JSON.stringify(defs)};
// ─── end baked language defs ──────────────────────────────────────────────`;
}

export async function bakeScript(scriptPath: string): Promise<string> {
  const engine = await buildGarbleSnippet();
  const defs = buildLangDefsSnippet();
  const raw = await Deno.readTextFile(scriptPath);
  return raw
    .replace(/\/\*\s*\{\{GARBLE_ENGINE\}\}\s*\*\//, engine)
    .replace(/\/\*\s*\{\{LANG_DEFS\}\}\s*\*\//, defs);
}
