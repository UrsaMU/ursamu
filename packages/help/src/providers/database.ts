/**
 * DbProvider — DBO-backed help entries editable at runtime via +help/set.
 *
 * Priority 100 — highest of the three built-in providers.
 * DB entries override both file-based and command-inline help.
 */

import { DBO } from "@ursamu/mush";
import type { HelpEntry, HelpProvider } from "../registry.ts";
import { slugify } from "../registry.ts";

export interface IHelpDbEntry {
  id: string;
  name: string;
  section: string;
  content: string;
  tags: string[];
  source: "database";
  createdBy: string;
  updatedAt: number;
}

const db = new DBO<IHelpDbEntry>("help.entries");

function toHelpEntry(row: IHelpDbEntry): HelpEntry {
  return {
    name: row.name,
    section: row.section,
    content: row.content,
    source: "database",
    tags: row.tags ?? [],
  };
}

export class DbProvider implements HelpProvider {
  readonly priority = 100;

  async get(topic: string): Promise<HelpEntry | null> {
    const rows = await db.find({ name: slugify(topic) });
    if (!rows.length) return null;
    return toHelpEntry(rows[0]);
  }

  async all(): Promise<HelpEntry[]> {
    const rows = await db.all();
    return rows.map(toHelpEntry);
  }
}

/**
 * Create or update a DB help entry. Returns the saved record.
 * Fires the `help:register` gameHook after save.
 *
 * @param fields  Entry data excluding auto-generated id and updatedAt.
 */
export async function upsertEntry(
  fields: Omit<IHelpDbEntry, "id" | "updatedAt">,
): Promise<IHelpDbEntry> {
  const name = slugify(fields.name);
  const existing = await db.find({ name });

  if (existing.length) {
    const updated: IHelpDbEntry = {
      ...existing[0],
      section: fields.section,
      content: fields.content,
      tags: fields.tags,
      createdBy: fields.createdBy,
      updatedAt: Date.now(),
    };
    await db.update({ name }, updated);
    return updated;
  }

  const created: IHelpDbEntry = {
    ...fields,
    name,
    id: crypto.randomUUID(),
    source: "database",
    updatedAt: Date.now(),
  };
  await db.create(created);
  return created;
}

/**
 * Delete a DB help entry by topic name.
 * @returns true if an entry was found and deleted; false if the topic had no DB entry.
 */
export async function deleteEntry(rawTopic: string): Promise<boolean> {
  const name = slugify(rawTopic);
  const existing = await db.find({ name });
  if (!existing.length) return false;
  await db.delete({ name });
  return true;
}
