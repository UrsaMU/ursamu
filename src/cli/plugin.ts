import { parse } from "@std/flags";
import { join, basename, dirname, fromFileUrl } from "@std/path";
import { exists } from "@std/fs";
import parser from "../services/parser/parser.ts";

const args = parse(Deno.args, {
  boolean: ["help"],
  alias: { h: "help" },
});

const fmt = (str: string) => parser.substitute("telnet", str);

const command = String(args._[0] || "");
const subArgs = args._.slice(1).map((arg: string | number) => String(arg));

const getRes = (text: string, defaultValue?: string) => {
  const promptText = defaultValue ? `${text} [${defaultValue}]: ` : `${text}: `;
  const val = prompt(promptText);
  if (val === null || val.trim() === "") return defaultValue || "";
  return val.trim();
};

const PLUGINS_DIR = join(dirname(dirname(fromFileUrl(import.meta.url))), "plugins");

if (args.help || !command) {
  showHelp();
  Deno.exit(0);
}

switch (command) {
  case "install":
    await installPlugin(subArgs[0]);
    break;
  case "init":
    if (subArgs[0]) {
      await initPluginProject(subArgs[0]);
    } else {
      await interactiveInitPlugin();
    }
    break;
  case "list":
    await listPlugins();
    break;
  case "remove":
    await removePlugin(subArgs[0]);
    break;
  default:
    console.error(`Unknown plugin command: ${command}`);
    showHelp();
    Deno.exit(1);
}

function showHelp() {
  console.log(`
UrsaMU Plugin Manager

Usage:
  ursamu plugin <command> [options]

Commands:
  install <url>    Install a plugin from a GitHub URL
  init <name>       Create a new standalone plugin project
  list             List all installed plugins
  remove <name>    Remove an installed plugin

Options:
  -h, --help       Show this help message
  `);
}

async function installPlugin(url: string) {
  if (!url) {
    console.error("Please provide a GitHub URL to install the plugin from.");
    Deno.exit(1);
  }

  console.log(`Installing plugin from ${url}...`);

  try {
    // Create a temporary directory
    const tempDir = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });
    
    // Clone the repository
    const cloneProcess = new Deno.Command("git", {
      args: ["clone", "--depth", "1", url, tempDir],
      stdout: "inherit",
      stderr: "inherit",
    });

    const status = await cloneProcess.spawn().status;
    if (!status.success) {
      console.error("Failed to clone the repository.");
      Deno.exit(status.code);
    }

    // Try to find the plugin name
    // For now, we'll use the repository name from the URL or the directory name if index.ts exists
    const pluginName = basename(url).replace(/\.git$/, "");
    
    // Check if index.ts exists
    if (!await exists(join(tempDir, "index.ts"))) {
       console.error("Could not find index.ts in the root of the repository.");
       await Deno.remove(tempDir, { recursive: true });
       Deno.exit(1);
    }

    // Remove .git directory
    const gitDir = join(tempDir, ".git");
    if (await exists(gitDir)) {
      await Deno.remove(gitDir, { recursive: true });
    }

    // Move to src/plugins
    const targetDir = join(PLUGINS_DIR, pluginName);
    
    if (await exists(targetDir)) {
      console.warn(`Plugin ${pluginName} already exists. Overwriting...`);
      await Deno.remove(targetDir, { recursive: true });
    }

    if (!await exists(PLUGINS_DIR)) {
      await Deno.mkdir(PLUGINS_DIR, { recursive: true });
    }

    await Deno.rename(tempDir, targetDir);
    console.log(`Successfully installed plugin: ${pluginName}`);

  } catch (error) {
    console.error(`Error installing plugin: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

async function listPlugins() {
  if (!await exists(PLUGINS_DIR)) {
    console.log("No plugins installed.");
    return;
  }

  console.log("Installed Plugins:");
  for await (const entry of Deno.readDir(PLUGINS_DIR)) {
    if (entry.isDirectory) {
      console.log(` - ${entry.name}`);
    }
  }
}

async function removePlugin(name: string) {
  if (!name) {
    console.error("Please provide the name of the plugin to remove.");
    Deno.exit(1);
  }

  const targetDir = join(PLUGINS_DIR, name);
  if (!await exists(targetDir)) {
    console.error(`Plugin ${name} not found.`);
    Deno.exit(1);
  }

  try {
    await Deno.remove(targetDir, { recursive: true });
    console.log(`Successfully removed plugin: ${name}`);
  } catch (error) {
    console.error(`Error removing plugin: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}
export async function initPluginProject(name: string, description?: string, version?: string) {
  if (!name) {
    console.error("Please provide a name for your plugin.");
    Deno.exit(1);
  }

  const targetDir = join(Deno.cwd(), name);
  if (await exists(targetDir)) {
    console.error(`Error: Directory already exists at ${targetDir}`);
    Deno.exit(1);
  }

  console.log(`Initializing new standalone UrsaMU plugin: ${name}`);

  try {
    await Deno.mkdir(targetDir, { recursive: true });
    await Deno.mkdir(join(targetDir, "src"), { recursive: true });
    await Deno.mkdir(join(targetDir, "tests"), { recursive: true });

    // deno.json
    const denoJson = {
      "tasks": {
        "test": "deno test -A"
      },
      "imports": {
        "ursamu": "jsr:@ursamu/ursamu"
      }
    };
    await Deno.writeTextFile(join(targetDir, "deno.json"), JSON.stringify(denoJson, null, 2));

    // src/index.ts
    const indexTs = `/**
 * Standalone UrsaMU Plugin
 */
const plugin = {
  name: "${name}",
  version: "${version || "1.0.0"}",
  description: "${description || "A description for " + name}",
  
  /**
   * Initialization logic for the plugin
   * @returns {boolean | Promise<boolean>}
   */
  init: async () => {
    console.log("${name} plugin initialized!");
    return true;
  }
};

export default plugin;
`;
    await Deno.writeTextFile(join(targetDir, "src", "index.ts"), indexTs);

    // tests/plugin.test.ts
    const testTs = `import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import plugin from "../src/index.ts";

Deno.test("${name} plugin metadata", () => {
  assertEquals(plugin.name, "${name}");
  assertEquals(plugin.version, "${version || "1.0.0"}");
});

Deno.test("${name} plugin initialization", async () => {
  // @ts-ignore: init might not be on the type but we know it's there
  const result = await plugin.init?.();
  assertEquals(result, true);
});
`;
    await Deno.writeTextFile(join(targetDir, "tests", "plugin.test.ts"), testTs);

    // .gitignore
    const gitignore = `.deno/
node_modules/
`;
    await Deno.writeTextFile(join(targetDir, ".gitignore"), gitignore);

    // README.md
    const readme = `# ${name}

An UrsaMU plugin.

## Testing
\`\`\`bash
deno task test
\`\`\`
`;
    await Deno.writeTextFile(join(targetDir, "README.md"), readme);

    console.log(`Plugin ${name} created successfully!`);
    console.log(`Next steps:
  cd ${name}
  deno task test`);

  } catch (error) {
    console.error(`Error creating plugin project: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

async function interactiveInitPlugin() {
  console.log(fmt(`
%ch%cc==================================================%cn
%ch%cw      Welcome to the %cyUrsaMU Plugin%cw Wizard%cn
%ch%cc==================================================%cn
%cw
This wizard will help you bootstrap your new standalone
UrsaMU plugin with a full testing suite.
%cn`));

  // 1. Plugin Information
  const pluginName = getRes("Plugin Name", "my-ursamu-plugin");
  const pluginDesc = getRes("Plugin Description", "A description for your plugin.");
  const pluginVer  = getRes("Plugin Version", "1.0.0");

  console.log(fmt(`\n%ch%cgCreating plugin: %cy${pluginName}%cn`));

  try {
    await initPluginProject(pluginName, pluginDesc, pluginVer);
    
    console.log(fmt(`\n%ch%cg✨ Success! Plugin project created.%cn`));
  } catch (err) {
    console.error(fmt(`\n%crFatal Error during plugin setup:%cn`), err);
    Deno.exit(1);
  }
}
