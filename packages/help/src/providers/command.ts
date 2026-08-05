/**
 * CommandProvider — surfaces help text declared in addCmd() registrations.
 *
 * Priority 10 — lowest of the three built-in providers.
 *
 * Commands with `hidden: true` are excluded.
 * Locks requiring builder+/admin/wizard mark staffOnly.
 */

import type { HelpEntry, HelpProvider } from "../registry.ts";
import { slugify } from "../registry.ts";
import {
  lockImpliesStaff,
  sectionImpliesStaff,
} from "../visibility.ts";

/**
 * Minimal shape of a registered command that we care about.
 * Matches ICmd from @ursamu/mush (mirrored locally).
 */
interface IHelpCmd {
  name: string;
  help?: string;
  category?: string;
  lock?: string;
  hidden?: boolean;
}

/** Convert an addCmd category to a section slug. */
function categoryToSection(category: string | undefined): string {
  if (!category) return "general";
  return category.toLowerCase().replace(/\s+/g, "-");
}

function buildEntry(cmd: IHelpCmd): HelpEntry {
  const section = categoryToSection(cmd.category);
  const staffOnly = lockImpliesStaff(cmd.lock) ||
    sectionImpliesStaff(section);
  return {
    name: slugify(cmd.name),
    section,
    content: cmd.help ?? "",
    source: "command",
    tags: [],
    staffOnly: staffOnly || undefined,
    // Staff-only commands stay out of public indexes
    hidden: staffOnly || undefined,
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
