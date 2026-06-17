/**
 * CommandProvider — surfaces help text declared in addCmd() registrations.
 *
 * Reads the live `cmds` array from the engine. This requires the engine PR
 * that adds `cmds` to mod.ts exports. Until that PR merges, this provider
 * returns no entries — file-based and DB help continue to work normally.
 *
 * Priority 10 — lowest of the three built-in providers, so files and DB
 * entries always win on name collision.
 *
 * Commands with `hidden: true` are excluded.
 * Commands with no `help` string are included as stub entries (name only, no body).
 */

import type { HelpEntry, HelpProvider } from "../registry.ts";
import { slugify } from "../registry.ts";

/**
 * Minimal shape of a registered command that we care about.
 * Matches ICmd from @ursamu/mush (not in public exports — mirrored locally).
 */
interface IHelpCmd {
  name: string;
  help?: string;
  category?: string;
  hidden?: boolean;
}

/** Convert an addCmd category to a section slug. */
function categoryToSection(category: string | undefined): string {
  if (!category) return "general";
  return category.toLowerCase().replace(/\s+/g, "-");
}

function buildEntry(cmd: IHelpCmd): HelpEntry {
  return {
    name: slugify(cmd.name),
    section: categoryToSection(cmd.category),
    content: cmd.help ?? "",
    source: "command",
    tags: [],
  };
}

/**
 * Get the live command registry from the engine.
 * Pre-PR (cmds not yet exported): returns empty array gracefully.
 */
async function getEngineCmds(): Promise<IHelpCmd[]> {
  // deno-lint-ignore no-explicit-any
  const engine = await import("@ursamu/mush") as any;
  return Array.isArray(engine.cmds) ? (engine.cmds as IHelpCmd[]) : [];
}

export class CommandProvider implements HelpProvider {
  readonly priority = 10;

  async get(topic: string): Promise<HelpEntry | null> {
    const cmds = await getEngineCmds();
    const cmd = cmds.find(
      (c: IHelpCmd) => !c.hidden && slugify(c.name) === topic,
    );
    if (!cmd) return null;
    return buildEntry(cmd);
  }

  async all(): Promise<HelpEntry[]> {
    const cmds = await getEngineCmds();
    return cmds
      .filter((c: IHelpCmd) => !c.hidden)
      .map(buildEntry);
  }
}
