import { addCmd } from "../../services/commands/index.ts";
import { send } from "../../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

interface StatEntry {
  key: string;
  title?: string;
  text: string;
  category: string;
  aliases?: string[];
  page_ref?: string;
  points?: number | number[];
  restrictions?: string;
  mechanics?: string;
  inclan_disciplines?: string[];
  [k: string]: unknown;
}

// --- Stat data cache ---
let statCache: StatEntry[] | null = null;
let aliasMap: Map<string, StatEntry> | null = null;

const DATA_DIR = "./system/scripts/pop/stats/data";
const DATA_FILES = [
  "attributes", "talents", "skills", "knowledges",
  "clans", "disciplines", "combo_disciplines",
  "backgrounds", "archetypes", "merits", "flaws",
  "virtues", "miscellanea",
];

async function loadStats(): Promise<{ entries: StatEntry[]; aliases: Map<string, StatEntry> }> {
  if (statCache && aliasMap) return { entries: statCache, aliases: aliasMap };

  const entries: StatEntry[] = [];
  const aliases = new Map<string, StatEntry>();

  for (const file of DATA_FILES) {
    try {
      const raw = await Deno.readTextFile(`${DATA_DIR}/${file}.json`);
      const data: StatEntry[] = JSON.parse(raw);
      for (const entry of data) {
        entries.push(entry);
        // Index by key and aliases (lowercase)
        aliases.set(entry.key.toLowerCase(), entry);
        if (entry.aliases) {
          for (const a of entry.aliases) {
            aliases.set(a.toLowerCase(), entry);
          }
        }
      }
    } catch {
      // File not found or invalid — skip silently
    }
  }

  statCache = entries;
  aliasMap = aliases;
  return { entries, aliases };
}

// Force reload on @reload
export function reloadStatCache() {
  statCache = null;
  aliasMap = null;
}

function formatPoints(p: number | number[] | undefined): string {
  if (p === undefined || p === null) return "";
  if (typeof p === "number") return `${p}`;
  if (p.length === 1) return `${p[0]}`;
  if (p.length === 2) return `${p[0]} or ${p[1]}`;
  return p.slice(0, -1).join(", ") + `, or ${p[p.length - 1]}`;
}

export default () => {
  addCmd({
    name: "+stat",
    pattern: /^\+stat(?:\s+(.*))?$/i,
    lock: "",
    exec: async (u: IUrsamuSDK) => {
      const socketId = u.socketId || "";
      const query = (u.cmd.args[0] || "").trim().toLowerCase();
      const { entries, aliases } = await loadStats();

      if (!query) {
        // List all categories
        const categories = new Map<string, number>();
        for (const e of entries) {
          categories.set(e.category, (categories.get(e.category) || 0) + 1);
        }
        let out = "%ch+stat categories:%cn\n";
        out += "%---------------------------------------------------------\n";
        for (const [cat, count] of [...categories.entries()].sort()) {
          out += `  %ch${cat}%cn (${count} entries)\n`;
        }
        out += "%---------------------------------------------------------\n";
        out += `${entries.length} stats loaded. Type %ch+stat <name>%cn to view a stat.\n`;
        out += `Type %ch+stat/list <category>%cn to list stats in a category.`;
        send([socketId], out);
        return;
      }

      // Check for /list switch
      const listMatch = query.match(/^\/list\s+(.+)/);
      if (listMatch) {
        const cat = listMatch[1].trim();
        const matches = entries.filter(e => e.category.toLowerCase().includes(cat));
        if (matches.length === 0) {
          send([socketId], `No stats found in category matching "${cat}".`);
          return;
        }
        let out = `%ch+stat: ${matches[0].category}%cn\n`;
        out += "%---------------------------------------------------------\n";
        for (const e of matches.sort((a, b) => a.key.localeCompare(b.key))) {
          const pts = formatPoints(e.points);
          out += `  %ch${e.key}%cn${pts ? ` (${pts} pts)` : ""}\n`;
        }
        out += "%---------------------------------------------------------\n";
        out += `${matches.length} entries.`;
        send([socketId], out);
        return;
      }

      // Look up a specific stat
      const entry = aliases.get(query);
      if (!entry) {
        // Try partial match
        const partial = entries.filter(e =>
          e.key.toLowerCase().includes(query) ||
          (e.aliases || []).some(a => a.toLowerCase().includes(query))
        );
        if (partial.length === 0) {
          send([socketId], `No stat found matching "${query}".`);
          return;
        }
        if (partial.length === 1) {
          // Show the single match
          displayStat(socketId, partial[0]);
          return;
        }
        // Multiple partial matches — list them
        let out = `%chMultiple matches for "${query}":%cn\n`;
        for (const e of partial.slice(0, 20)) {
          out += `  ${e.key} (${e.category})\n`;
        }
        if (partial.length > 20) out += `  ... and ${partial.length - 20} more.\n`;
        send([socketId], out);
        return;
      }

      displayStat(socketId, entry);
    },
  });
};

function displayStat(socketId: string, entry: StatEntry) {
  let out = `%ch${entry.title || entry.key}%cn`;
  if (entry.category) out += ` %cx[${entry.category}]%cn`;
  out += "\n%---------------------------------------------------------\n";

  if (entry.text) {
    out += entry.text + "\n";
  }

  if (entry.points !== undefined) {
    out += `\n%chPoints:%cn ${formatPoints(entry.points)}\n`;
  }

  if (entry.restrictions) {
    out += `\n%chRestrictions:%cn ${entry.restrictions}\n`;
  }

  if (entry.mechanics) {
    out += `\n%chMechanics:%cn\n${entry.mechanics}\n`;
  }

  if (entry.inclan_disciplines) {
    out += `\n%chIn-Clan Disciplines:%cn ${entry.inclan_disciplines.join(", ")}\n`;
  }

  if (entry.aliases && entry.aliases.length > 0) {
    out += `\n%chAliases:%cn ${entry.aliases.join(", ")}\n`;
  }

  if (entry.page_ref) {
    out += `%chRef:%cn ${entry.page_ref}\n`;
  }

  out += "%---------------------------------------------------------";
  send([socketId], out);
}
