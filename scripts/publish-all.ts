import { join } from "@std/path";

interface PackageInfo {
  dir: string;
  name: string;
  version: string;
  imports: Record<string, string>;
  dependencies: string[];
}

async function main() {
  const rootDenoJsonPath = join(Deno.cwd(), "deno.json");
  let rootDenoJson;
  try {
    rootDenoJson = JSON.parse(await Deno.readTextFile(rootDenoJsonPath));
  } catch (err) {
    console.error("Failed to read root deno.json:", err);
    Deno.exit(1);
  }

  const workspaceMembers: string[] = rootDenoJson.workspace || [];
  if (workspaceMembers.length === 0) {
    console.log("No workspace members found in root deno.json.");
    Deno.exit(0);
  }

  const packages: PackageInfo[] = [];
  const packageMap = new Map<string, PackageInfo>();

  // 1. Load all package info
  for (const member of workspaceMembers) {
    const memberDir = join(Deno.cwd(), member);
    const denoJsonPath = join(memberDir, "deno.json");
    try {
      const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
      if (!denoJson.name) continue;

      const info: PackageInfo = {
        dir: member,
        name: denoJson.name,
        version: denoJson.version || "0.0.0",
        imports: denoJson.imports || {},
        dependencies: [],
      };
      packages.push(info);
      packageMap.set(info.name, info);
    } catch {
      // Skip folders without deno.json or invalid JSON
    }
  }

  // Add the root package itself if it has a name
  if (rootDenoJson.name) {
    const rootInfo: PackageInfo = {
      dir: ".",
      name: rootDenoJson.name,
      version: rootDenoJson.version || "0.0.0",
      imports: rootDenoJson.imports || {},
      dependencies: [],
    };
    packages.push(rootInfo);
    packageMap.set(rootInfo.name, rootInfo);
  }

  // 2. Determine dependencies between workspace packages by scanning package files and imports
  const workspaceNames = new Set(packages.map((p) => p.name));

  // Helper to find all JS/TS files in a directory or file path
  async function findFiles(basePath: string, relativePath: string): Promise<string[]> {
    const fullPath = join(basePath, relativePath);
    try {
      const stat = await Deno.stat(fullPath);
      if (stat.isFile) {
        return [fullPath];
      } else if (stat.isDirectory) {
        const files: string[] = [];
        for await (const entry of Deno.readDir(fullPath)) {
          if (entry.name === "tests" || entry.name === "node_modules") continue;
          const subFiles = await findFiles(basePath, join(relativePath, entry.name));
          files.push(...subFiles);
        }
        return files;
      }
    } catch {
      // Path doesn't exist
    }
    return [];
  }

  for (const p of packages) {
    const pDir = join(Deno.cwd(), p.dir);
    // Find all files that are included in publish (defaulting to mod.ts and src if not specified)
    let includes = ["mod.ts", "src"];
    try {
      const denoJson = JSON.parse(await Deno.readTextFile(join(pDir, "deno.json")));
      if (denoJson.publish?.include) {
        includes = denoJson.publish.include;
      }
    } catch {
      // Fallback to defaults
    }

    const filesToScan: string[] = [];
    for (const inc of includes) {
      if (inc === "deno.json" || inc === "README.md" || inc === "LICENSE") continue;
      const found = await findFiles(pDir, inc);
      filesToScan.push(...found);
    }

    // Scan each file for imports of other workspace packages (including side-effect imports and version constraints)
    const importRegex = /^\s*(?:(?:import|export)\s+[\s\S]*?\s+from\s+['"](?:jsr:)?(@ursamu\/[a-zA-Z0-9-_]+)(?:@[^'"]+)?(?:\/[^'"]*)?['"]|import\s+['"](?:jsr:)?(@ursamu\/[a-zA-Z0-9-_]+)(?:@[^'"]+)?(?:\/[^'"]*)?['"])/gm;
    for (const filePath of filesToScan) {
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".js") && !filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) {
        continue;
      }
      try {
        const content = await Deno.readTextFile(filePath);
        // Strip comments and template strings to avoid matching commented-out imports or generator templates
        const cleanContent = content
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*/g, "")
          .replace(/`[\s\S]*?`/g, "");
        
        let match;
        while ((match = importRegex.exec(cleanContent)) !== null) {
          const depName = match[1] || match[2];
          if (depName && workspaceNames.has(depName) && depName !== p.name) {
            p.dependencies.push(depName);
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Also check deno.json imports as fallback
    for (const [key, value] of Object.entries(p.imports)) {
      let depName = "";
      if (value.startsWith("jsr:")) {
        const match = value.slice(4).match(/^(@[^\/]+\/[^@]+|[^@\/]+)/);
        if (match) depName = match[1];
      } else if (workspaceNames.has(key)) {
        depName = key;
      } else if (workspaceNames.has(value)) {
        depName = value;
      }

      if (depName && workspaceNames.has(depName) && depName !== p.name) {
        p.dependencies.push(depName);
      }
    }

    // Remove duplicates
    p.dependencies = Array.from(new Set(p.dependencies));
  }

  // 3. Topological Sort
  const visited = new Set<string>();
  const temp = new Set<string>();
  const order: PackageInfo[] = [];

  function visit(name: string) {
    if (temp.has(name)) {
      console.error(`Circular dependency detected involving: ${name}`);
      return;
    }
    if (!visited.has(name)) {
      temp.add(name);
      const pkg = packageMap.get(name);
      if (pkg) {
        for (const dep of pkg.dependencies) {
          visit(dep);
        }
      }
      temp.delete(name);
      visited.add(name);
      const pkgToPush = packageMap.get(name);
      if (pkgToPush) order.push(pkgToPush);
    }
  }

  for (const p of packages) {
    visit(p.name);
  }

  console.log("Determined publish order:");
  for (let i = 0; i < order.length; i++) {
    console.log(`  ${i + 1}. ${order[i].name} (${order[i].dir})`);
  }

  console.log("\nStarting publish process...");

  for (const pkg of order) {
    console.log(`\n==================================================`);
    console.log(`Publishing ${pkg.name}@${pkg.version} in ${pkg.dir}...`);
    console.log(`==================================================`);

    const command = new Deno.Command("deno", {
      args: ["publish", "--allow-dirty", ...Deno.args],
      cwd: join(Deno.cwd(), pkg.dir),
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const { success, code } = await command.output();
    if (!success) {
      console.error(`\nFailed to publish ${pkg.name}. Exit code: ${code}`);
      Deno.exit(code);
    }
  }

  console.log("\nAll packages published successfully!");
}

if (import.meta.main) {
  await main();
}
