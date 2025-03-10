import {  dpath } from "../../deps.ts";
import { txtFiles } from "../services/commands/index.ts";

export const loadTxtDir = (dir: string) => {
  try {
    const files = Deno.readDirSync(dir);
    for (const file of files) {
      const filePath = dpath.join(dir, file.name);
      if (file.isDirectory) {
        loadTxtDir(filePath);
      } else {
        if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
          const content = Deno.readTextFileSync(filePath);
          txtFiles.set(file.name, content);
        }
      }
    }
  } catch (error) {
    console.error(`Error loading text directory ${dir}:`, error);
  }
};
