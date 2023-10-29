import { readdir } from "fs/promises";

export const plugins = async (dir: string) => {
  const dirent = await readdir(dir);
  const files = dirent.filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );

  files.forEach((file) => {
    delete require.cache[require.resolve(`${dir}/${file}`)];
    require(`${dir}/${file}`).default();
  });
};
