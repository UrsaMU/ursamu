import fs, { readFileSync } from "fs";
import path from "path";
import { txtFiles } from "../services/text";

export const loadTxtDir = async (dir: string) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      loadTxtDir(path.join(dir, file));
    } else {
      if (file.endsWith(".txt") || file.endsWith(".md")) {
        const content = readFileSync(path.join(dir, file), "utf8");
        txtFiles.set(file, content);
      }
    }
  }
};
