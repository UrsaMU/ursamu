#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * This script creates a new documentation page with the proper front matter.
 * Usage: deno run -A scripts/create-page.ts <section> <page-name>
 * Example: deno run -A scripts/create-page.ts guides getting-started
 */

import { join, dirname } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from "https://deno.land/std/fs/ensure_dir.ts";

// Function to generate title from filename
function generateTitle(filename: string): string {
  // Convert kebab-case to Title Case
  return filename
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Main function
async function main() {
  // Get command line arguments
  const args = Deno.args;
  
  if (args.length < 2) {
    console.error("Usage: deno run -A scripts/create-page.ts <section> <page-name>");
    console.error("Example: deno run -A scripts/create-page.ts guides getting-started");
    Deno.exit(1);
  }
  
  const section = args[0];
  const pageName = args[1];
  
  // Create the file path
  const docsDir = new URL("../", import.meta.url).pathname;
  const filePath = join(docsDir, section, `${pageName}.md`);
  
  // Ensure the directory exists
  await ensureDir(dirname(filePath));
  
  // Check if file already exists
  try {
    await Deno.stat(filePath);
    console.error(`Error: File ${filePath} already exists`);
    Deno.exit(1);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
  
  // Generate the title
  const title = generateTitle(pageName);
  
  // Create the file content
  const content = `---
title: ${title}
layout: layout.njk
---

# ${title}

Write your documentation here.

## Introduction

## Details

## Examples

## Related

- [Link to related page](./related-page.md)
`;
  
  // Write the file
  await Deno.writeTextFile(filePath, content);
  console.log(`Created new page: ${filePath}`);
}

// Run the main function
main().catch(console.error); 