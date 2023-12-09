import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { txtFiles } from "../services/commands";

export const loadTxtDir = async (dir: string) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      loadTxtDir(path.join(dir, file));
    } else {
      if (file.endsWith(".txt" || ".md")) {
        const content = readFileSync(path.join(dir, file), "utf8");
        txtFiles.set(file, content);
      }
    }
  }
};
