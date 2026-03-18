import { dfs, dpath } from "../../deps.ts";

export async function plugins(dir: string) {

  const entries = dfs.walk(dir, { match: [/\.ts$/, /\.js$/], maxDepth: 1 })
  for await (const entry of entries) {
    if (entry.isFile) {

      // Dynamically import the module from a runtime-discovered filesystem path.
      // The file:// URL bypasses the import map entirely, so the JSR
      // "unanalyzable-dynamic-import" warning here is a false positive —
      // no import-map rewriting is needed or possible for absolute file paths.
      const module = await import(dpath.toFileUrl(entry.path).href);
      // If the module has a default export function, call it
      module.default?.();
    }
  }
}
