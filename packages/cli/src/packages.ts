#!/usr/bin/env -S deno run -A

import { join } from "@std/path";
import { existsSync } from "@std/fs";

export interface PackageOption {
  name: string;
  pkgName: string;
  jsrUrl: string;
  description: string;
}

export const optionalPackages: PackageOption[] = [
  {
    name: "SGP (Globals)",
    pkgName: "@ursamu/globals",
    jsrUrl: "jsr:@ursamu/globals",
    description: "SGP globals and utility function library",
  },
  {
    name: "Public Site (FE shell)",
    pkgName: "@ursamu/site",
    jsrUrl: "jsr:@ursamu/site@^0.1.77",
    description: "Public web portal shell, skins, /play UI",
  },
  {
    name: "Staff Web Console",
    pkgName: "@ursamu/web",
    jsrUrl: "jsr:@ursamu/web@^0.2.71",
    description: "Staff admin SPA at /admin (wiki, DB, settings)",
  },
  {
    name: "BBS (Bulletin Board)",
    pkgName: "@ursamu/bbs",
    jsrUrl: "jsr:@ursamu/bbs@^1.1.0",
    description: "In-game bulletin boards & forums",
  },
  {
    name: "Chronicles of Darkness",
    pkgName: "@ursamu/cofd-plugin",
    jsrUrl: "jsr:@ursamu/cofd-plugin@^1.2.0",
    description: "CoFD 2e sheets, rolls, & chargen",
  },
  {
    name: "Combat System",
    pkgName: "@ursamu/combat",
    jsrUrl: "jsr:@ursamu/combat@^0.8.0",
    description: "Turn-based combat engine & initiative tracking",
  },
  {
    name: "D&D 5e Rules",
    pkgName: "@ursamu/dnd-plugin",
    jsrUrl: "jsr:@ursamu/dnd-plugin@^1.0.0",
    description: "D&D 5e/2024 sheets, rolls, & resources",
  },
  {
    name: "Discord Bridge",
    pkgName: "@ursamu/discord",
    jsrUrl: "jsr:@ursamu/discord@^1.0.0",
    description: "Discord bot bridge for channel chat",
  },
  {
    name: "Fabula Ultima Rules",
    pkgName: "@ursamu/fabula-plugin",
    jsrUrl: "jsr:@ursamu/fabula-plugin@^1.0.0",
    description: "Fabula Ultima TTRPG system support",
  },
  {
    name: "In-Game Help",
    pkgName: "@ursamu/help",
    jsrUrl: "jsr:@ursamu/help@^1.2.0",
    description: "Help file compiler & interactive viewer",
  },
  {
    name: "In-Game Mail",
    pkgName: "@ursamu/mail",
    jsrUrl: "jsr:@ursamu/mail@^2.7.0",
    description: "Offline mail (post/inbox) messaging",
  },
  {
    name: "In-Game Wiki",
    pkgName: "@ursamu/wiki",
    jsrUrl: "jsr:@ursamu/wiki@^0.2.7",
    description: "Wiki system, editing, & backlinks",
  },
  {
    name: "Jobs System",
    pkgName: "@ursamu/jobs",
    jsrUrl: "jsr:@ursamu/jobs@^1.1.0",
    description: "Player-staff ticketing/jobs system",
  },
  {
    name: "Language Garbling",
    pkgName: "@ursamu/lang-plugin",
    jsrUrl: "jsr:@ursamu/lang-plugin@^3.0.0",
    description: "Phoneme-based fake speech garbling",
  },
  {
    name: "Map Plugin",
    pkgName: "@ursamu/map-plugin",
    jsrUrl: "jsr:@ursamu/map-plugin@^3.1.0",
    description: "Interactive and graphical grid maps",
  },
  {
    name: "Mekton Zeta Rules",
    pkgName: "@ursamu/mekton-zeta",
    jsrUrl: "jsr:@ursamu/mekton-zeta@^0.1.0",
    description: "Mekton Zeta RPG rules integration",
  },
  {
    name: "d20 Modern Rules",
    pkgName: "@ursamu/d20-modern-plugin",
    jsrUrl: "jsr:@ursamu/d20-modern-plugin@^1.0.0",
    description: "d20 Modern sheets, rolls, & chargen",
  },
  {
    name: "Shop Vendor",
    pkgName: "@ursamu/vendor-plugin",
    jsrUrl: "jsr:@ursamu/vendor-plugin@^1.0.0",
    description: "Shop vendor NPC system",
  },
  {
    name: "Communication Channels",
    pkgName: "@ursamu/channels",
    jsrUrl: "jsr:@ursamu/channels@^1.1.0",
    description: "In-game player chat channel system",
  },
  {
    name: "Builder Tools",
    pkgName: "@ursamu/builder",
    jsrUrl: "jsr:@ursamu/builder@^1.3.0",
    description: "Room building & wizard/staff tools",
  },
  {
    name: "Events & Hooks",
    pkgName: "@ursamu/events",
    jsrUrl: "jsr:@ursamu/events@^0.1.0",
    description: "Custom game events & hooks system",
  },
];

export async function runPackagesWizard() {
  const currentDir = Deno.cwd();
  const denoJsonPath = join(currentDir, "deno.json");

  let denoJson: any = {};
  if (existsSync(denoJsonPath)) {
    try {
      denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
    } catch {
      console.error("Error: Found deno.json but failed to parse it.");
      Deno.exit(1);
    }
  } else {
    console.log("No deno.json found in the current directory.");
    const createNew = prompt(
      "Create a basic deno.json in this directory? (y/N)"
    );
    if (createNew?.toLowerCase() === "y") {
      denoJson = {
        nodeModulesDir: "auto",
        imports: {
          "ursamu": "jsr:@ursamu/mush",
          "@ursamu/mush": "jsr:@ursamu/mush",
          "@ursamu/core": "jsr:@ursamu/core",
        },
      };
    } else {
      console.log("Aborted. Please run from an UrsaMU project directory.");
      Deno.exit(1);
    }
  }

  if (!denoJson.imports) {
    denoJson.imports = {};
  }

  // Determine current selections based on imports
  const selections = new Set<string>();
  for (const option of optionalPackages) {
    if (denoJson.imports[option.pkgName]) {
      selections.add(option.pkgName);
    }
  }

  while (true) {
    console.clear();
    console.log("==================================================");
    console.log("         UrsaMU Optional JSR Packages             ");
    console.log("==================================================");
    console.log("");
    console.log("Toggle optional packages for your game project:");
    console.log("");

    for (let i = 0; i < optionalPackages.length; i++) {
      const opt = optionalPackages[i];
      const isSelected = selections.has(opt.pkgName);
      const box = isSelected ? "[x]" : "[ ]";
      console.log(`${box} ${i + 1}. ${opt.name} (${opt.pkgName})`);
      console.log(`    ${opt.description}`);
    }

    console.log("");
    console.log(
      "Enter a number to toggle, or press Enter (or 'done') to save & exit."
    );

    const input = prompt("Selection:")?.trim();
    if (!input || input.toLowerCase() === "done") {
      break;
    }

    const index = parseInt(input, 10) - 1;
    if (isNaN(index) || index < 0 || index >= optionalPackages.length) {
      console.log("Invalid option. Press any key to continue...");
      prompt("");
      continue;
    }

    const pkg = optionalPackages[index].pkgName;
    if (selections.has(pkg)) {
      selections.delete(pkg);
    } else {
      selections.add(pkg);
    }
  }

  // Update deno.json imports
  for (const opt of optionalPackages) {
    if (selections.has(opt.pkgName)) {
      denoJson.imports[opt.pkgName] = opt.jsrUrl;
    } else {
      delete denoJson.imports[opt.pkgName];
    }
  }

  try {
    await Deno.writeTextFile(
      denoJsonPath,
      JSON.stringify(denoJson, null, 2)
    );
    console.log("");
    console.log(`Successfully updated ${denoJsonPath}!`);
  } catch (err) {
    console.error("Failed to write deno.json:", err);
  }
}

if (import.meta.main) {
  await runPackagesWizard();
}
