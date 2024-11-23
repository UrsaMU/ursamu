import fs, { readFileSync } from "fs";
import path from "path";
import { txtFiles } from "../services/text";

const parseFrontmatter = (
  content: string,
): { frontmatter: any; content: string } => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content };
  }

  const [, frontmatterStr, remainingContent] = match;
  const frontmatter: any = {};

  // Parse the frontmatter
  frontmatterStr.split("\n").forEach((line) => {
    const [key, value] = line.split(":").map((str) => str.trim());
    if (key && value) {
      frontmatter[key] = value;
    }
  });

  return {
    frontmatter,
    content: remainingContent.trim(),
  };
};

export const loadTxtDir = async (dir: string) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      loadTxtDir(path.join(dir, file));
    } else {
      if (file.endsWith(".txt") || file.endsWith(".md")) {
        const rawContent = readFileSync(path.join(dir, file), "utf8");

        if (file.endsWith(".md")) {
          // Parse frontmatter for markdown files
          const { frontmatter, content } = parseFrontmatter(rawContent);
          txtFiles.set(file, {
            content,
            category: frontmatter.category,
          });
        } else {
          // For .txt files, just store the content
          txtFiles.set(file, {
            content: rawContent,
          });
        }
      }
    }
  }
};
