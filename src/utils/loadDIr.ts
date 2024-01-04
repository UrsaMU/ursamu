import { dfs, dpath } from "../../deps.ts";

export async function plugins(source: string) {
  // Check if the source is a URL
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const module = await import(source);
    module.default?.();
  } else {
    // Check if the source is a file or directory
    const stat = await Deno.stat(source);

    if (stat.isFile) {
      // Source is a file, import it directly
      const module = await import(dpath.toFileUrl(source).toString());
      module.default?.();
    } else if (stat.isDirectory) {
      // Source is a directory, iterate over .ts and .js files in it
      const entries = dfs.walk(source, {
        match: [/\.ts$/, /\.js$/],
        maxDepth: 1,
      });
      for await (const entry of entries) {
        if (entry.isFile) {
          const module = await import(dpath.toFileUrl(entry.path).toString());
          module.default?.();
        }
      }
    } else {
      console.error("Source is neither a file nor a directory:", source);
    }
  }
}
