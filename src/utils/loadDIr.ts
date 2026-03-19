import { dfs, dpath } from "../../deps.ts";

export async function plugins(dir: string, cacheBuster?: string) {

  const entries = dfs.walk(dir, { match: [/\.ts$/, /\.js$/], maxDepth: 3 })
  for await (const entry of entries) {
    if (entry.isFile) {

      // Dynamically import the module (with optional cache-buster for hot-reload)
      const url = dpath.toFileUrl(entry.path).href + (cacheBuster || "");
      const module = await import(url);
      // If the module has a default export function, call it
      module.default?.();
    }
  }
}
