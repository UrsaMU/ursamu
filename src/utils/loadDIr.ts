import { dfs, dpath } from "../../deps.ts";

export async function plugins(dir: string) {
  console.log(`[Plugins] Loading commands from ${dir}...`);
  const entries = dfs.walk(dir, { match: [/\.ts$/, /\.js$/], maxDepth: 1 })
  for await (const entry of entries) {
    if (entry.isFile) {
      console.log(`[Plugins] Loading ${entry.name}...`);
      // Dynamically import the module
      const module = await import(dpath.toFileUrl(entry.path).href);
      // If the module has a default export function, call it
      module.default?.();
    }
  }
}
