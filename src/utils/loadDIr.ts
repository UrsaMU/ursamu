import fs from "fs";
import { readdir } from "fs/promises";
import path from "path";

// Original loadDir for loading modules
export const loadDir = async (dir: string) => {
  const dirent = await readdir(dir);
  const files = dirent.filter(
    (file) =>
      (file.endsWith(".ts") ||
        (file.endsWith(".js") && !file.endsWith(".d.ts"))) &&
      file !== "index.ts" && file !== "index.js",
  );

  files.forEach((file) => {
    delete require.cache[require.resolve(`${dir}/${file}`)];
    const module = require(`${dir}/${file}`);
    Object.values(module).forEach((exported) => {
      if (typeof exported === "function") {
        exported();
      }
    });
  });
};

// New function for getting file paths
export const getFilePaths = async (dir: string): Promise<string[]> => {
  const files = await readdir(dir);
  return files.map((file) => path.join(dir, file));
};

export const loadDirCallback = (
  dir: string,
  callback: (file: any, dir: string) => void,
) => {
  fs.readdir(dir, (err, files) => {
    if (err) throw err;

    files.forEach((file: string) => {
      callback(file, dir);
    });
  });
};
