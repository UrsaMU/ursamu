import * as dpath from "@std/path";
import { type LangDef, validateLangDef } from "./schema.ts";

const store = new Map<string, LangDef>();
let configuredDir: string | null = null;

export function setLanguagesDir(dir: string): void {
  configuredDir = dir;
}

export function getLanguagesDir(): string {
  return configuredDir ?? dpath.join(Deno.cwd(), "data", "languages");
}

export function getLang(name: string): LangDef | undefined {
  return store.get(name.toLowerCase());
}

export function listLangs(): LangDef[] {
  return [...store.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function clearLangs(): void {
  store.clear();
}

export interface LoadReport {
  loaded: string[];
  errors: string[];
}

export async function loadLanguages(dir?: string): Promise<LoadReport> {
  const target = dir ?? getLanguagesDir();
  const report: LoadReport = { loaded: [], errors: [] };
  clearLangs();

  try {
    for await (const entry of Deno.readDir(target)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const path = dpath.join(target, entry.name);
      let raw: unknown;
      try {
        raw = JSON.parse(await Deno.readTextFile(path));
      } catch (e: unknown) {
        report.errors.push(`${entry.name}: invalid JSON — ${(e as Error).message}`);
        continue;
      }
      const result = validateLangDef(raw, entry.name);
      if (!result.ok) {
        report.errors.push(...result.errors);
        continue;
      }
      const def = raw as LangDef;
      store.set(def.name.toLowerCase(), def);
      report.loaded.push(def.name);
    }
  } catch (e: unknown) {
    report.errors.push(`cannot read ${target}: ${(e as Error).message}`);
  }
  return report;
}

export function registerLangForTest(def: LangDef): void {
  store.set(def.name.toLowerCase(), def);
}
