import { readFileSync } from "fs";
import { join } from "path";
import { getFilePaths } from "../../utils/loadDIr";
import matter from "gray-matter";

export interface HelpFileData {
  content: string;
  category?: string;
  hidden?: boolean;
}

export const txtFiles = new Map<string, HelpFileData>();

export const loadText = async () => {
  const files = await getFilePaths(join(process.cwd(), "text"));
  const helpFiles = await getFilePaths(join(process.cwd(), "help"));

  for (const file of files) {
    const data = readFileSync(file, "utf8");
    const name = file.split("/").pop() || "";
    txtFiles.set(name, { content: data });
  }

  for (const file of helpFiles) {
    const fileContent = readFileSync(file, "utf8");
    const { data, content } = matter(fileContent);
    const name = file.split("/").pop() || "";
    txtFiles.set(name, {
      content,
      category: data.category,
      hidden: data.hidden
    });
  }
};
