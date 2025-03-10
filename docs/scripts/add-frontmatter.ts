#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * This script adds front matter to all markdown files in the docs directory
 * that don't already have it.
 */

import { walk } from "https://deno.land/std/fs/walk.ts";
import { basename, dirname, join } from "https://deno.land/std/path/mod.ts";

// Function to generate title from filename
function generateTitle(filename: string): string {
  // Remove extension and convert to title case
  const name = basename(filename, ".md");
  if (name === "index") {
    // For index files, use the directory name
    const dir = basename(dirname(filename));
    if (dir === "docs") {
      return "Home";
    }
    return dir.charAt(0).toUpperCase() + dir.slice(1);
  }
  
  // Convert kebab-case to Title Case
  return name
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Function to add front matter to a file
async function addFrontMatter(filePath: string): Promise<void> {
  const content = await Deno.readTextFile(filePath);
  
  // Skip if file already has front matter
  if (content.startsWith("---")) {
    console.log(`Skipping ${filePath} - already has front matter`);
    return;
  }
  
  const title = generateTitle(filePath);
  const frontMatter = `---
title: ${title}
layout: layout.njk
---

`;
  
  await Deno.writeTextFile(filePath, frontMatter + content);
  console.log(`Added front matter to ${filePath}`);
}

// Main function
async function main() {
  const docsDir = new URL("../", import.meta.url).pathname;
  
  // Walk through all markdown files in the docs directory
  for await (const entry of walk(docsDir, {
    exts: [".md"],
    skip: [/node_modules/, /_site/, /scripts/],
  })) {
    if (entry.isFile) {
      await addFrontMatter(entry.path);
    }
  }
  
  console.log("Done adding front matter to markdown files");
}

// Run the main function
main().catch(console.error); 