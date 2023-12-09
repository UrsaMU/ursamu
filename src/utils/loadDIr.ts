import fs from "fs";
import { readdir } from "fs/promises";
import path from "path";

export const loadDir = async (dir: string) => {
  const dirent = await readdir(dir);
  const files = dirent.filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );

  files.forEach((file) => {
    delete require.cache[require.resolve(`${dir}/${file}`)];
    require(`${dir}/${file}`).default();
  });
};
