import { dfs, dpath } from "../../deps.ts";
import { txtFiles } from "../services/commands/index.ts";

export const loadTxtDir = async (dir: string) => {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = dpath.join(dir, entry.name);
    if (entry.isDirectory) {
      await loadTxtDir(fullPath);
    } else if (entry.isFile && (entry.name.endsWith(".txt") || entry.name.endsWith(".md"))) {
      const content = await Deno.readTextFile(fullPath);
      txtFiles.set(entry.name, content);
    }
  }
};
