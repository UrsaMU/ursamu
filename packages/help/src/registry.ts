/**
 * HelpRegistry — central aggregator for all help content.
 *
 * Three built-in providers are registered during plugin init():
 *   CommandProvider  — reads cmds[] exported by the engine
 *   FileProvider     — scans ./help/ and any dirs registered via registerHelpDir()
 *   DbProvider       — DBO-backed runtime entries (admin-editable in-game)
 *
 * Provider priority (highest wins on name collision):
 *   database > root-file > plugin-file > command-inline
 *
 * External plugins can add their own providers via registry.addProvider().
 */

export type HelpSource = "command" | "file" | "database";

/** A single resolved help topic. */
export interface HelpEntry {
  /** Lowercase slug, e.g. "mail/send". "/" separates sub-topics only. */
  name: string;
  /** Grouping label, e.g. "mail", "general", "admin". */
  section: string;
  /** Raw markdown content. Empty string means the topic exists but has no body. */
  content: string;
  /** Where this entry came from. */
  source: HelpSource;
  /** Alternate names that resolve to this topic. */
  tags: string[];
}

/** Implement this interface to add a custom help source. */
export interface HelpProvider {
  readonly priority: number;
  /** Return null if this provider has no entry for the given topic. */
  get(topic: string): Promise<HelpEntry | null>;
  /** Return all entries this provider knows about. */
  all(): Promise<HelpEntry[]>;
}

/** Normalize a raw topic string to a canonical slug. */
export function slugify(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9\-/]/g, "");
}

export class HelpRegistry {
  private readonly _providers: HelpProvider[] = [];

  addProvider(provider: HelpProvider): void {
    this._providers.push(provider);
    this._providers.sort((a, b) => b.priority - a.priority);
  }

  removeProvider(provider: HelpProvider): void {
    const idx = this._providers.indexOf(provider);
    if (idx !== -1) this._providers.splice(idx, 1);
  }

  /**
   * Look up a topic across all providers.
   * Returns the first non-null result (providers sorted by descending priority).
   * Also checks aliases (tags) if direct lookup fails.
   */
  async lookup(rawTopic: string): Promise<HelpEntry | null> {
    const topic = slugify(rawTopic);

    for (const provider of this._providers) {
      const entry = await provider.get(topic);
      if (entry) return entry;
    }

    // Fallback: scan tags of all entries
    const all = await this.all();
    return all.find((e) => e.tags.includes(topic)) ?? null;
  }

  /** All entries across all providers, deduped by name (higher-priority provider wins). */
  async all(): Promise<HelpEntry[]> {
    const seen = new Map<string, HelpEntry>();

    // Iterate lowest-priority first so higher-priority entries overwrite
    const ordered = [...this._providers].sort((a, b) => a.priority - b.priority);
    for (const provider of ordered) {
      const entries = await provider.all();
      for (const entry of entries) {
        seen.set(entry.name, entry);
      }
    }

    return Array.from(seen.values());
  }

  /** All distinct section names, sorted alphabetically. */
  async sections(): Promise<string[]> {
    const entries = await this.all();
    const names = new Set(entries.map((e) => e.section));
    return Array.from(names).sort();
  }

  /** All entries in a given section, sorted by name. */
  async inSection(section: string): Promise<HelpEntry[]> {
    const entries = await this.all();
    return entries.filter((e) => e.section === section).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }
}

/** Singleton registry shared across all providers and commands. */
export const helpRegistry = new HelpRegistry();

/**
 * Register a single help entry at runtime (does not persist — use DbProvider
 * or registerHelpEntry for persisted entries).
 * Convenience wrapper used by tests and one-off integrations.
 */
export function registerHelpEntry(entry: HelpEntry): void {
  // Inline single-entry provider, lowest priority
  const p: HelpProvider = {
    priority: 5,
    get: (topic) => Promise.resolve(slugify(entry.name) === topic ? entry : null),
    all: () => Promise.resolve([entry]),
  };
  helpRegistry.addProvider(p);
}
