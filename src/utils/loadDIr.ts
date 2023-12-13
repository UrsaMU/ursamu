import fs, { Dirent } from "fs";
import { readdir } from "fs/promises";
import path, { join } from "path";
import { IConfig } from "../@types";

export const loadDir = async (dir: string) => {
  const dirent = await readdir(dir);
  const files = dirent.filter(
    (file) =>
      file.endsWith(".ts") || (file.endsWith(".js") && !file.endsWith(".d.ts"))
  );

  files.forEach((file) => {
    delete require.cache[require.resolve(`${dir}/${file}`)];
    require(`${dir}/${file}`).default();
  });
};

export const loadDirCallback = (
  dir: string,
  callback: (file: any, dir: string) => void
) => {
  fs.readdir(dir, (err, files) => {
    if (err) throw err;

    files.forEach((file: string) => {
      callback(file, dir);
    });
  });
};

export const loadPLugin = async (dir: string) => {
  const dirent = await readdir(dir);
  if (dirent.includes("ursamu.config.json")) {
    console.log(dir);
    const pkg: IConfig = require(`${dir}/ursamu.config.json`);
    if (pkg.engine && pkg.engine.main) {
      const main = require(`${dir}/${pkg.engine.main}`);
      main.default();
    }
  } else {
    console.log("No config found.");
  }
};
