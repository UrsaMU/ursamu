// +notes -- character notes with public/private visibility.

import { header, footer, divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  noteSlug,
  validateName,
  validateText,
  type CofdNote,
  type CofdNotes,
} from "../notes/index.ts";

type Db = { state: { cofd_notes?: CofdNotes; [k: string]: unknown }; id: string; name?: string };

function isStaff(o: { flags: Set<string> }): boolean {
  return o.flags.has("superuser") || o.flags.has("admin") || o.flags.has("wizard");
}

function getNotes(o: { state?: { cofd_notes?: CofdNotes } }): CofdNotes {
  return (o.state?.cofd_notes ?? {}) as CofdNotes;
}

function canViewNote(viewer: { id: string; flags: Set<string> }, owner: { id: string }, note: CofdNote): boolean {
  if (note.visibility === "public") return true;
  if (viewer.id === owner.id) return true;
  return isStaff(viewer);
}

/** Parse a "<player>/<name>" or "<name>" reference. */
function splitPlayerRef(raw: string): { who: string; rest: string } {
  const slash = raw.indexOf("/");
  if (slash < 0) return { who: "", rest: raw.trim() };
  return { who: raw.slice(0, slash).trim(), rest: raw.slice(slash + 1).trim() };
}

function splitOnFirst(raw: string, sep: string): { left: string; right: string } | null {
  const i = raw.indexOf(sep);
  if (i < 0) return null;
  return { left: raw.slice(0, i).trim(), right: raw.slice(i + 1).trim() };
}

async function resolveTarget(u: IUrsamuSDK, who: string): Promise<Db | null> {
  if (!who || who.toLowerCase() === "self" || who.toLowerCase() === "me") {
    return u.me as unknown as Db;
  }
  const t = await u.util.target(u.me, who, true);
  return (t as unknown as Db) ?? null;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

async function showList(u: IUrsamuSDK, target: Db, viewerIsOwner: boolean) {
  const notes = getNotes(target);
  const visible = Object.values(notes).filter(n => canViewNote(u.me as unknown as { id: string; flags: Set<string> }, target, n));
  const name = u.util.displayName(target as unknown as Parameters<typeof u.util.displayName>[0], u.me);
  const lines: string[] = [];
  lines.push(await header(`Notes: ${name}`));
  if (visible.length === 0) {
    lines.push(viewerIsOwner ? "You have no notes." : "No notes are visible.");
  } else {
    lines.push("  %chName%cn                                   %chVisibility%cn   %chUpdated%cn");
    lines.push(await divider());
    for (const n of visible.sort((a, b) => a.name.localeCompare(b.name))) {
      const vis = n.visibility === "private" ? "%cyprivate%cn" : "public ";
      lines.push(`  ${n.name.padEnd(40)}  ${vis.padEnd(12)}  ${fmtDate(n.updatedAt)}`);
    }
  }
  lines.push(await footer());
  u.send(lines.join("\n"));
}

async function showOne(u: IUrsamuSDK, target: Db, slug: string) {
  const notes = getNotes(target);
  const note = notes[slug];
  if (!note) {
    u.send(`No such note.`);
    return;
  }
  if (!canViewNote(u.me as unknown as { id: string; flags: Set<string> }, target, note)) {
    u.send(`No such note.`);
    return;
  }
  const owner = u.util.displayName(target as unknown as Parameters<typeof u.util.displayName>[0], u.me);
  const lines: string[] = [];
  lines.push(await header(`${owner} / ${note.name}`));
  lines.push(`  Visibility: ${note.visibility}    Updated: ${fmtDate(note.updatedAt)}`);
  lines.push(await divider());
  lines.push(note.text);
  lines.push(await footer());
  u.send(lines.join("\n"));
}

async function writeNotes(u: IUrsamuSDK, target: Db, notes: CofdNotes) {
  await u.db.modify(target.id, "$set", { "data.cofd_notes": notes });
}

export async function notesExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  // --- no switch: view list or single note ----------------------------------
  if (!sw) {
    if (!rest) {
      await showList(u, u.me as unknown as Db, true);
      return;
    }
    const { who, rest: noteRef } = splitPlayerRef(rest);
    const target = await resolveTarget(u, who || rest);
    if (!target) {
      u.send(`No player matches '${who || rest}'.`);
      return;
    }
    const viewerIsOwner = target.id === u.me.id;
    if (who && noteRef) {
      await showOne(u, target, noteSlug(noteRef));
    } else {
      await showList(u, target, viewerIsOwner);
    }
    return;
  }

  // --- /add -----------------------------------------------------------------
  if (sw === "add" || sw === "edit") {
    const split = splitOnFirst(rest, "=");
    if (!split) {
      u.send(`Usage: +notes/${sw} [<player>/]<name>=<text>`);
      return;
    }
    const { who, rest: rawName } = splitPlayerRef(split.left);
    const target = await resolveTarget(u, who);
    if (!target) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    if (target.id !== u.me.id && !(await u.canEdit(u.me as unknown as Parameters<typeof u.canEdit>[0], target as unknown as Parameters<typeof u.canEdit>[1]))) {
      u.send("Permission denied.");
      return;
    }

    const cleanName = rawName;
    const cleanText = split.right;
    const nv = validateName(cleanName);
    if (!nv.ok) { u.send(`%cr${nv.error}%cn`); return; }
    const tv = validateText(cleanText);
    if (!tv.ok) { u.send(`%cr${tv.error}%cn`); return; }

    const notes = { ...getNotes(target) };
    const slug = noteSlug(cleanName);
    const now = Date.now();
    const existing = notes[slug];
    if (sw === "add" && existing) {
      u.send(`A note named '${existing.name}' already exists; use /edit to replace it.`);
      return;
    }
    if (sw === "edit" && !existing) {
      u.send(`No note named '${cleanName}' to edit; use /add to create it.`);
      return;
    }
    const note: CofdNote = {
      name: cleanName,
      text: cleanText,
      visibility: existing?.visibility ?? "public",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      createdBy: existing?.createdBy ?? u.me.id,
    };
    notes[slug] = note;
    await writeNotes(u, target, notes);
    u.send(`Note '${cleanName}' ${sw === "add" ? "added" : "updated"} on ${u.util.displayName(target as unknown as Parameters<typeof u.util.displayName>[0], u.me)}.`);
    return;
  }

  // --- /del -----------------------------------------------------------------
  if (sw === "del" || sw === "delete" || sw === "rem" || sw === "remove") {
    const { who, rest: rawName } = splitPlayerRef(rest);
    const target = await resolveTarget(u, who);
    if (!target) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    if (target.id !== u.me.id && !(await u.canEdit(u.me as unknown as Parameters<typeof u.canEdit>[0], target as unknown as Parameters<typeof u.canEdit>[1]))) {
      u.send("Permission denied.");
      return;
    }
    if (!rawName) {
      u.send("Usage: +notes/del [<player>/]<name>");
      return;
    }
    const notes = { ...getNotes(target) };
    const slug = noteSlug(rawName);
    if (!notes[slug]) {
      u.send(`No such note.`);
      return;
    }
    const removed = notes[slug].name;
    delete notes[slug];
    await writeNotes(u, target, notes);
    u.send(`Deleted note '${removed}' from ${u.util.displayName(target as unknown as Parameters<typeof u.util.displayName>[0], u.me)}.`);
    return;
  }

  // --- /priv ----------------------------------------------------------------
  if (sw === "priv" || sw === "private" || sw === "visibility") {
    const split = splitOnFirst(rest, "=");
    if (!split) {
      u.send("Usage: +notes/priv [<player>/]<name>=public|private");
      return;
    }
    const { who, rest: rawName } = splitPlayerRef(split.left);
    const target = await resolveTarget(u, who);
    if (!target) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    if (target.id !== u.me.id && !(await u.canEdit(u.me as unknown as Parameters<typeof u.canEdit>[0], target as unknown as Parameters<typeof u.canEdit>[1]))) {
      u.send("Permission denied.");
      return;
    }
    const vis = split.right.toLowerCase();
    if (vis !== "public" && vis !== "private") {
      u.send("Visibility must be 'public' or 'private'.");
      return;
    }
    const notes = { ...getNotes(target) };
    const slug = noteSlug(rawName);
    const note = notes[slug];
    if (!note) {
      u.send(`No such note.`);
      return;
    }
    notes[slug] = { ...note, visibility: vis, updatedAt: Date.now() };
    await writeNotes(u, target, notes);
    u.send(`Note '${note.name}' is now ${vis}.`);
    return;
  }

  u.send(`Unknown +notes switch '/${sw}'. Use /add, /edit, /del, or /priv.`);
}
