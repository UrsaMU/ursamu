import { dfs, dpath } from "../../deps.ts";

export async function plugins(dir: string) {
  const entries = dfs.walk(dir, { match: [/\.ts$/, /\.js$/], maxDepth: 1 })
  for await (const entry of entries) {
    if (entry.isFile) {
      // Dynamically import the module
      const module = await import(dpath.toFileUrl(entry.path).toString());
      // If the module has a default export function, call it
      module.default?.();
    }
  }
}
