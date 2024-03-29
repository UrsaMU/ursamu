import { dfs, dpath, join, viewFiles } from "../../deps.ts";

export async function plugins(source: string, mu?: any) {
  // Check if the source is a URL
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const module = await import(source);
    if (mu) return module.default?.(mu);
    return module.default?.();
  } else {
    // Handle local directory logic
    const entries = await (async () => {
      try {
        const stat = await Deno.stat(source);
        if (stat.isDirectory) {
          return dfs.walk(source, {
            match: [/\.ts$/, /\.j$/, /\.hbs$/],
            maxDepth: 1,
          });
        }
        return [{ isFile: true, path: source }];
      } catch {
        return [];
      }
    })();

    for await (const entry of entries) {
      if (entry.isFile) {
        if (entry.path.endsWith(".hbs")) {
          const file = await Deno.readTextFile(entry.path);
          viewFiles.set(dpath.basename(entry.path), file);
        } else {
          const module = await import(dpath.toFileUrl(entry.path).toString());
          if (mu) module.default?.(mu);
          module.default?.();
        }
      }
    }
  }
}
