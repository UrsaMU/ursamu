// deno-lint-ignore-file no-import-prefix
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const COMMANDS_DIR = "./src/commands";
const HELP_DIR = "./help";

async function main() {
  console.log("Scanning commands...");
  
  for await (const entry of walk(COMMANDS_DIR, { exts: ["ts"] })) {
    if (entry.isFile) {
      const content = await Deno.readTextFile(entry.path);
      
      // regex to find addCmd calls
      // This is a naive regex, assuming standard formatting
      // We look for name: "...", then help: "..." anywhere in the object
      
      // Match addCmd({ ... }) blocks
      const matches = content.matchAll(/addCmd\(\s*({[\s\S]*?})\s*\)/g);
      
      for (const match of matches) {
        const block = match[1];
        
        const nameMatch = block.match(/name:\s*["']([^"']+)["']/);
        const helpMatch = block.match(/help:\s*["']([^"']+)["']/);
        
        if (nameMatch) {
          const name = nameMatch[1];
          const help = helpMatch ? helpMatch[1] : "No help available.";
          
          const filename = `help_${name.toLowerCase().replace(/[^a-z0-9@]/g, "_")}.md`;
          const filepath = join(HELP_DIR, filename);
          
          try {
            await Deno.stat(filepath);
            console.log(`Skipping existing help file: ${filename}`);
          } catch {
            console.log(`Generating ${filename} for command ${name}`);
            const mdContent = `# ${name}\n\n${help}\n`;
            await Deno.writeTextFile(filepath, mdContent);
          }
        }
      }
    }
  }
}

main();
