// deno-lint-ignore-file no-explicit-any
/**
 * Price of Power: Notes System
 *
 * Commands:
 *   +notes                          — list all your notes
 *   +notes/<category>               — list notes in one category
 *   +notes <target>/*               — list visible notes on a target
 *   +note <name or #>               — read one of your notes
 *   +note <name>=<text>             — create/edit a note (General)
 *   +note/<category> <name>=<text>  — create/edit in a specific category
 *   +notemove <note>=<category>     — move a note to another category
 *   +notestatus <note>=PUBLIC|PRIVATE — change visibility
 *   +noteprove <note>=<target(s)>   — show a note to other characters
 *   +notedelete <note>              — delete a note
 *   +notedecompile <note>           — show raw text for copy/paste
 *   +noteapprove <character>/<note> — staff: approve a note
 */

import { addCmd } from "../../services/commands/index.ts";
import { dbojs } from "../../services/Database/index.ts";
import { send } from "../../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface Note {
  id: number;
  title: string;
  text: string;
  category: string;
  status: "PUBLIC" | "PRIVATE";
  approved: boolean;
  approved_by: string | null;
  approved_at: number | null;
}

const VALID_CATEGORIES = [
  "General",
  "Backgrounds",
  "Stat",
  "Story",
  "Merits",
  "Flaws",
  "IMPORTANT",
];

const CATEGORY_LOWER: Record<string, string> = {};
for (const c of VALID_CATEGORIES) CATEGORY_LOWER[c.toLowerCase()] = c;

const WIDTH = 77;

// ============================================================================
// HELPERS
// ============================================================================

function isStaff(flags: string): boolean {
  return (
    flags.includes("superuser") ||
    flags.includes("admin") ||
    flags.includes("wizard")
  );
}

async function sendToPlayer(playerId: string, msg: string) {
  const { wsService } = await import("../../services/WebSocket/index.ts");
  const socket = wsService
    .getConnectedSockets()
    .find((s: any) => s.cid === playerId);
  if (socket) send([socket.id], msg);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function lookupPlayer(name: string): Promise<any> {
  const escaped = escapeRegex(name.trim());
  const results = await dbojs.query({
    "data.name": new RegExp(`^${escaped}$`, "i"),
  });
  return results.find((o: any) => o.flags?.includes("player")) || null;
}

function getNotes(data: any): Note[] {
  return (data?.notes as Note[]) || [];
}

function findNote(notes: Note[], query: string, staff: boolean): Note | null {
  query = query.trim();

  const raw = query.replace(/^#/, "");
  const nid = parseInt(raw, 10);
  if (!isNaN(nid)) {
    for (const n of notes) {
      if (n.id === nid) {
        if (n.category === "IMPORTANT" && !staff) return null;
        return n;
      }
    }
    if (query.startsWith("#")) return null;
  }

  const qlower = query.toLowerCase();
  for (const n of notes) {
    if (n.title.toLowerCase() === qlower) {
      if (n.category === "IMPORTANT" && !staff) return null;
      return n;
    }
  }
  return null;
}

function resolveCategory(name: string): string | null {
  return CATEGORY_LOWER[name.trim().toLowerCase()] || null;
}

function renumberNotes(notes: Note[]) {
  for (let i = 0; i < notes.length; i++) notes[i].id = i + 1;
}

function header(title: string): string {
  const t = ` ${title} `;
  const pad = Math.floor((WIDTH - t.length) / 2);
  return "=".repeat(pad) + t + "=".repeat(WIDTH - pad - t.length);
}

function divider(): string {
  return "-".repeat(WIDTH);
}

function footer(): string {
  return "=".repeat(WIDTH);
}

function formatNoteDisplay(note: Note): string {
  const lines = [header(`Note #${note.id}`)];
  lines.push(` Title:     ${note.title}`);
  lines.push(` Category:  ${note.category}`);
  lines.push(` Status:    ${note.status}`);
  let approvedStr = "No";
  if (note.approved) {
    const parts = ["Yes"];
    if (note.approved_by) parts.push(`by ${note.approved_by}`);
    if (note.approved_at) parts.push(`on ${new Date(note.approved_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`);
    approvedStr = parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(", ")})` : parts[0];
  }
  lines.push(` Approved:  ${approvedStr}`);
  lines.push(divider());
  lines.push(` ${note.text}`);
  lines.push(footer());
  return lines.join("\r\n");
}

// ============================================================================
// EXPORTED HELPERS (for chargen integration)
// ============================================================================

export async function getPlayerNotes(playerId: string): Promise<Note[]> {
  const obj = await dbojs.queryOne({ id: playerId });
  return getNotes(obj?.data);
}

export async function hasApprovedNoteInCategory(
  playerId: string,
  category: string,
): Promise<boolean> {
  const notes = await getPlayerNotes(playerId);
  return notes.some(
    (n) => n.category.toLowerCase() === category.toLowerCase() && n.approved,
  );
}

export async function getPlayerNoteByTitle(
  playerId: string,
  title: string,
): Promise<Note | undefined> {
  const notes = await getPlayerNotes(playerId);
  return notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
}

// ============================================================================
// COMMANDS
// ============================================================================

export function registerNotesCommands() {
  // --------------------------------------------------------------------------
  // +notes — list notes
  // --------------------------------------------------------------------------
  addCmd({
    name: "+notes",
    pattern: /^\+notes(?:\/(\w+))?(?:\s+(.*))?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;
      const staff = isStaff(playerObj.flags || "");

      const args = u.cmd.args || [];
      const categorySwitch = args[0]?.trim() || "";
      const targetArg = args[1]?.trim() || "";

      let targetObj = playerObj;

      if (targetArg.endsWith("/*")) {
        const targetName = targetArg.slice(0, -2).trim();
        const found = await lookupPlayer(targetName);
        if (!found) return send([sid], `>GAME: Target '${targetName}' not found.`);
        targetObj = found;
      } else if (targetArg) {
        const found = await lookupPlayer(targetArg);
        if (!found) return send([sid], `>GAME: Target '${targetArg}' not found.`);
        targetObj = found;
      }

      let catFilter: string | null = null;
      if (categorySwitch) {
        catFilter = resolveCategory(categorySwitch);
        if (!catFilter) return send([sid], `>GAME: Invalid category '${categorySwitch}'. Valid: ${VALID_CATEGORIES.slice(0, -1).join(", ")}`);
        if (catFilter === "IMPORTANT" && !staff) return send([sid], ">GAME: Invalid category.");
      }

      const notes = getNotes(targetObj.data);
      const isOwn = targetObj.id === playerObj.id;

      const visible: Note[] = [];
      for (const n of notes) {
        if (n.category === "IMPORTANT" && !staff) continue;
        if (!isOwn && !staff && n.status !== "PUBLIC") continue;
        if (catFilter && n.category !== catFilter) continue;
        visible.push(n);
      }

      if (visible.length === 0) {
        if (isOwn) return send([sid], ">GAME: You have no notes to display.");
        return send([sid], `>GAME: No visible notes on ${targetObj.data?.name || "Unknown"}.`);
      }

      const title = isOwn ? "Your Notes" : `${targetObj.data?.name || "Unknown"}'s Notes`;
      const lines = [header(title)];
      lines.push(` ${"#".padEnd(5)}${"Title".padEnd(25)}${"Category".padEnd(15)}${"Status".padEnd(10)}${"Approved".padEnd(10)}`);
      for (const n of visible.sort((a, b) => a.id - b.id)) {
        const astr = n.approved ? "Yes" : "No";
        lines.push(` ${String(n.id).padEnd(5)}${n.title.slice(0, 23).padEnd(25)}${n.category.padEnd(15)}${n.status.padEnd(10)}${astr.padEnd(10)}`);
      }
      lines.push(footer());
      send([sid], lines.join("\r\n"));
    },
  });

  // --------------------------------------------------------------------------
  // +note — read / create / edit
  // --------------------------------------------------------------------------
  addCmd({
    name: "+note",
    pattern: /^\+note(?:\/(\w+))?\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;
      const staff = isStaff(playerObj.flags || "");

      const args = u.cmd.args || [];
      const switchName = args[0]?.trim() || "";
      const rawArgs = args[1]?.trim() || "";

      if (!rawArgs) return send([sid], ">GAME: Usage: +note <name or #> | +note <name>=<text>");

      // Route switch commands: +note/move, +note/status, +note/prove, +note/delete, +note/decompile, +note/approve
      const switchLower = switchName.toLowerCase();
      if (["move", "status", "prove", "delete", "del", "decompile", "approve"].includes(switchLower)) {
        const eqIdx = rawArgs.indexOf("=");
        if (switchLower === "move") {
          if (eqIdx === -1) return send([sid], ">GAME: Usage: +note/move <note>=<category>");
          const noteQuery = rawArgs.slice(0, eqIdx).trim();
          const catName = rawArgs.slice(eqIdx + 1).trim();
          const notes = getNotes(playerObj.data);
          const note = findNote(notes, noteQuery, staff);
          if (!note) return send([sid], ">GAME: Note not found.");
          const newCat = resolveCategory(catName);
          if (!newCat) return send([sid], `>GAME: Invalid category '${catName}'. Valid: ${VALID_CATEGORIES.slice(0, -1).join(", ")}`);
          if (newCat === "IMPORTANT" && !staff) return send([sid], ">GAME: You cannot use that category.");
          if (note.approved && !staff) return send([sid], ">GAME: That note has been approved and cannot be changed. Contact staff if you need to move it.");
          const oldCat = note.category;
          note.category = newCat;
          if (staff) { note.approved = false; note.approved_by = null; note.approved_at = null; }
          await dbojs.modify({ id: playerObj.id }, "$set", { "data.notes": notes } as any);
          return send([sid], `>GAME: Note #${note.id} moved from ${oldCat} to ${newCat}.`);
        }
        if (switchLower === "status") {
          if (eqIdx === -1) return send([sid], ">GAME: Usage: +note/status <note>=PRIVATE|PUBLIC");
          const noteQuery = rawArgs.slice(0, eqIdx).trim();
          const newStatus = rawArgs.slice(eqIdx + 1).trim().toUpperCase();
          if (newStatus !== "PRIVATE" && newStatus !== "PUBLIC") return send([sid], ">GAME: Status must be PRIVATE or PUBLIC.");
          const notes = getNotes(playerObj.data);
          const note = findNote(notes, noteQuery, staff);
          if (!note) return send([sid], ">GAME: Note not found.");
          note.status = newStatus as "PUBLIC" | "PRIVATE";
          await dbojs.modify({ id: playerObj.id }, "$set", { "data.notes": notes } as any);
          return send([sid], `>GAME: Note #${note.id} is now ${newStatus}.`);
        }
        if (switchLower === "prove") {
          if (eqIdx === -1) return send([sid], ">GAME: Usage: +note/prove <note>=<target(s)>");
          const noteQuery = rawArgs.slice(0, eqIdx).trim();
          const targetNames = rawArgs.slice(eqIdx + 1).split(",").map((t) => t.trim()).filter(Boolean);
          if (targetNames.length === 0) return send([sid], ">GAME: You must specify at least one target.");
          const notes = getNotes(playerObj.data);
          const note = findNote(notes, noteQuery, staff);
          if (!note) return send([sid], ">GAME: Note not found.");
          const senderName = playerObj.data?.moniker || playerObj.data?.name || "Unknown";
          const shownTo: string[] = [];
          for (const tname of targetNames) {
            const target = await lookupPlayer(tname);
            if (!target) { send([sid], `>GAME: Character '${tname}' not found.`); continue; }
            if (target.data?.location !== playerObj.data?.location) { send([sid], `>GAME: ${target.data?.name || tname} is not in the same room.`); continue; }
            const proveLines = [header(`Note from ${senderName}`), ` Title:     ${note.title}`, ` Category:  ${note.category}`, divider(), ` ${note.text}`, footer()];
            await sendToPlayer(target.id, proveLines.join("\r\n"));
            shownTo.push(target.data?.name || tname);
          }
          if (shownTo.length > 0) send([sid], `>GAME: Note #${note.id} shown to: ${shownTo.join(", ")}.`);
          return;
        }
        if (switchLower === "delete" || switchLower === "del") {
          const noteQuery = rawArgs.trim();
          if (!noteQuery) return send([sid], ">GAME: Usage: +note/delete <note>");
          const notes = getNotes(playerObj.data);
          const note = findNote(notes, noteQuery, staff);
          if (!note) return send([sid], ">GAME: Note not found.");
          if (note.category === "IMPORTANT" && !staff) return send([sid], ">GAME: Note not found.");
          if (note.approved && !staff) return send([sid], ">GAME: That note has been approved and cannot be deleted. Contact staff if you need to remove it.");
          const title = note.title; const nid = note.id;
          notes.splice(notes.indexOf(note), 1);
          renumberNotes(notes);
          await dbojs.modify({ id: playerObj.id }, "$set", { "data.notes": notes } as any);
          return send([sid], `>GAME: Note #${nid} ('${title}') deleted.`);
        }
        if (switchLower === "decompile") {
          let targetObj = playerObj;
          let noteQuery = rawArgs;
          if (rawArgs.includes("/")) {
            const [targetName, nq] = rawArgs.split("/", 2);
            const found = await lookupPlayer(targetName.trim());
            if (!found) return send([sid], `>GAME: Target '${targetName.trim()}' not found.`);
            targetObj = found;
            noteQuery = nq.trim();
          }
          const notes = getNotes(targetObj.data);
          const note = findNote(notes, noteQuery, staff);
          if (!note) return send([sid], ">GAME: Note not found.");
          const isOwn = targetObj.id === playerObj.id;
          if (!isOwn && !staff && (note.status === "PRIVATE" || note.category === "IMPORTANT")) return send([sid], ">GAME: Note not found.");
          return send([sid], `>GAME: Decompile of note #${note.id} (${note.title}):\r\n${note.text}`);
        }
        if (switchLower === "approve") {
          if (!staff) return send([sid], ">GAME: Permission denied.");
          if (!rawArgs.includes("/")) return send([sid], ">GAME: Usage: +note/approve <character>/<note>");
          const [targetName, noteQuery] = rawArgs.split("/", 2);
          const target = await lookupPlayer(targetName.trim());
          if (!target) return send([sid], `>GAME: Target '${targetName.trim()}' not found.`);
          const notes = getNotes(target.data);
          const note = findNote(notes, noteQuery.trim(), true);
          if (!note) return send([sid], ">GAME: Note not found.");
          const staffName = playerObj.data?.moniker || playerObj.data?.name || "Staff";
          note.approved = true; note.approved_by = staffName; note.approved_at = Date.now();
          await dbojs.modify({ id: target.id }, "$set", { "data.notes": notes } as any);
          send([sid], `>GAME: Note #${note.id} ('${note.title}') on ${target.data?.name || "Unknown"} approved.`);
          if (note.category !== "IMPORTANT") await sendToPlayer(target.id, `>GAME: Your note '${note.title}' has been approved by ${staffName}.`);
          return;
        }
      }

      // If the switch looks like a player name (not a valid category) and
      // rawArgs has no "=", treat it as +note <player>/<noteQuery> read.
      // The cmdParser may split "Claude/Background" into switch="Claude" args="Background".
      const categorySwitch = switchName;
      let category = "General";
      let categoryIsValid = false;
      if (categorySwitch) {
        const cat = resolveCategory(categorySwitch);
        if (cat) {
          if (cat === "IMPORTANT" && !staff) return send([sid], ">GAME: You cannot use that category.");
          category = cat;
          categoryIsValid = true;
        } else {
          // Not a valid category — might be +note <player>/<note> parsed as switch
          // Reconstruct as target/noteQuery read
          const eqIdx = rawArgs.indexOf("=");
          if (eqIdx === -1) {
            // READ: treat switchName as player name, rawArgs as note query
            const found = await lookupPlayer(categorySwitch);
            if (found) {
              const notes = getNotes(found.data);
              const note = findNote(notes, rawArgs, staff);
              if (!note) return send([sid], ">GAME: Note not found.");
              const isOwn = found.id === playerObj.id;
              if (!isOwn && !staff && note.status !== "PUBLIC") return send([sid], ">GAME: That note is private.");
              return send([sid], formatNoteDisplay(note));
            }
          }
          // Not a player either — invalid category
          return send([sid], `>GAME: Invalid category '${categorySwitch}'. Valid: ${VALID_CATEGORIES.slice(0, -1).join(", ")}`);
        }
      }

      const eqIdx = rawArgs.indexOf("=");

      if (eqIdx !== -1) {
        // CREATE / EDIT
        let lhs = rawArgs.slice(0, eqIdx).trim();
        const text = rawArgs.slice(eqIdx + 1).trim();
        if (!text) return send([sid], ">GAME: Note text cannot be empty.");

        let targetObj = playerObj;
        if (lhs.includes("/")) {
          const [targetName, noteTitle] = lhs.split("/", 2);
          const found = await lookupPlayer(targetName.trim());
          if (!found) return send([sid], `>GAME: Target '${targetName.trim()}' not found.`);
          if (!staff && found.id !== playerObj.id) return send([sid], ">GAME: You don't have permission to edit notes on that.");
          targetObj = found;
          lhs = noteTitle.trim();
        }

        if (!lhs) return send([sid], ">GAME: You must provide a note title.");

        const notes = getNotes(targetObj.data);
        const existing = notes.find((n) => n.title.toLowerCase() === lhs.toLowerCase());

        if (existing) {
          if (existing.category === "IMPORTANT" && !staff) return send([sid], ">GAME: Note not found.");
          if (existing.approved && !staff) return send([sid], ">GAME: That note has been approved and cannot be changed. Contact staff if you need to update it.");
          existing.text = text;
          if (categoryIsValid) existing.category = category;
          if (staff) { existing.approved = false; existing.approved_by = null; existing.approved_at = null; }
          await dbojs.modify({ id: targetObj.id }, "$set", { "data.notes": notes } as any);
          send([sid], `>GAME: Note #${existing.id} ('${existing.title}') updated.`);
        } else {
          const newNote: Note = { id: notes.length + 1, title: lhs, text, category, status: "PRIVATE", approved: false, approved_by: null, approved_at: null };
          notes.push(newNote);
          await dbojs.modify({ id: targetObj.id }, "$set", { "data.notes": notes } as any);
          send([sid], `>GAME: Note #${newNote.id} ('${lhs}') created in ${category}.`);
        }
      } else {
        // READ
        let targetObj = playerObj;
        let noteQuery = rawArgs;
        if (rawArgs.includes("/")) {
          const [targetName, nq] = rawArgs.split("/", 2);
          const found = await lookupPlayer(targetName.trim());
          if (!found) return send([sid], `>GAME: Target '${targetName.trim()}' not found.`);
          targetObj = found;
          noteQuery = nq.trim();
        }

        const notes = getNotes(targetObj.data);
        const note = findNote(notes, noteQuery, staff);
        if (!note) return send([sid], ">GAME: Note not found.");

        const isOwn = targetObj.id === playerObj.id;
        if (!isOwn && !staff && note.status !== "PUBLIC") return send([sid], ">GAME: That note is private.");

        send([sid], formatNoteDisplay(note));
      }
    },
  });

  // --------------------------------------------------------------------------
  // +notemove — move note to different category
  // --------------------------------------------------------------------------
  addCmd({
    name: "+notemove",
    pattern: /^\+notemove\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;
      const staff = isStaff(playerObj.flags || "");

      const raw = (u.cmd.args || [])[0]?.trim() || "";
      const eqIdx = raw.indexOf("=");
      if (eqIdx === -1) return send([sid], ">GAME: Usage: +notemove <note>=<category>");

      const noteQuery = raw.slice(0, eqIdx).trim();
      const catName = raw.slice(eqIdx + 1).trim();

      const notes = getNotes(playerObj.data);
      const note = findNote(notes, noteQuery, staff);
      if (!note) return send([sid], ">GAME: Note not found.");

      const newCat = resolveCategory(catName);
      if (!newCat) return send([sid], `>GAME: Invalid category '${catName}'. Valid: ${VALID_CATEGORIES.slice(0, -1).join(", ")}`);
      if (newCat === "IMPORTANT" && !staff) return send([sid], ">GAME: You cannot use that category.");
      if (note.approved && !staff) return send([sid], ">GAME: That note has been approved and cannot be changed. Contact staff if you need to move it.");

      const oldCat = note.category;
      note.category = newCat;
      if (staff) { note.approved = false; note.approved_by = null; note.approved_at = null; }
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.notes": notes } as any);
      send([sid], `>GAME: Note #${note.id} moved from ${oldCat} to ${newCat}.`);
    },
  });

  // --------------------------------------------------------------------------
  // +notestatus — toggle PUBLIC / PRIVATE
  // --------------------------------------------------------------------------
  addCmd({
    name: "+notestatus",
    pattern: /^\+notestatus\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;
      const staff = isStaff(playerObj.flags || "");

      const raw = (u.cmd.args || [])[0]?.trim() || "";
      const eqIdx = raw.indexOf("=");
      if (eqIdx === -1) return send([sid], ">GAME: Usage: +notestatus <note>=PRIVATE|PUBLIC");

      const noteQuery = raw.slice(0, eqIdx).trim();
      const newStatus = raw.slice(eqIdx + 1).trim().toUpperCase();
      if (newStatus !== "PRIVATE" && newStatus !== "PUBLIC") return send([sid], ">GAME: Status must be PRIVATE or PUBLIC.");

      const notes = getNotes(playerObj.data);
      const note = findNote(notes, noteQuery, staff);
      if (!note) return send([sid], ">GAME: Note not found.");

      note.status = newStatus as "PUBLIC" | "PRIVATE";
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.notes": notes } as any);
      send([sid], `>GAME: Note #${note.id} is now ${newStatus}.`);
    },
  });

  // --------------------------------------------------------------------------
  // +noteprove — show a note to other characters in the room
  // --------------------------------------------------------------------------
  addCmd({
    name: "+noteprove",
    pattern: /^\+noteprove\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;
      const staff = isStaff(playerObj.flags || "");

      const raw = (u.cmd.args || [])[0]?.trim() || "";
      const eqIdx = raw.indexOf("=");
      if (eqIdx === -1) return send([sid], ">GAME: Usage: +noteprove <note>=<target(s)>");

      const noteQuery = raw.slice(0, eqIdx).trim();
      const targetNames = raw.slice(eqIdx + 1).split(",").map((t) => t.trim()).filter(Boolean);
      if (targetNames.length === 0) return send([sid], ">GAME: You must specify at least one target.");

      const notes = getNotes(playerObj.data);
      const note = findNote(notes, noteQuery, staff);
      if (!note) return send([sid], ">GAME: Note not found.");

      const senderName = playerObj.data?.moniker || playerObj.data?.name || "Unknown";
      const shownTo: string[] = [];

      for (const tname of targetNames) {
        const target = await lookupPlayer(tname);
        if (!target) { send([sid], `>GAME: Character '${tname}' not found.`); continue; }
        if (target.data?.location !== playerObj.data?.location) { send([sid], `>GAME: ${target.data?.name || tname} is not in the same room.`); continue; }

        const proveLines = [header(`Note from ${senderName}`)];
        proveLines.push(` Title:     ${note.title}`);
        proveLines.push(` Category:  ${note.category}`);
        proveLines.push(divider());
        proveLines.push(` ${note.text}`);
        proveLines.push(footer());
        await sendToPlayer(target.id, proveLines.join("\r\n"));
        shownTo.push(target.data?.name || tname);
      }

      if (shownTo.length > 0) send([sid], `>GAME: Note #${note.id} shown to: ${shownTo.join(", ")}.`);
    },
  });

  // --------------------------------------------------------------------------
  // +notedelete — delete a note
  // --------------------------------------------------------------------------
  addCmd({
    name: "+notedelete",
    pattern: /^\+notedelete\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;
      const staff = isStaff(playerObj.flags || "");

      const noteQuery = ((u.cmd.args || [])[0] || "").trim();
      if (!noteQuery) return send([sid], ">GAME: Usage: +notedelete <note>");

      const notes = getNotes(playerObj.data);
      const note = findNote(notes, noteQuery, staff);
      if (!note) return send([sid], ">GAME: Note not found.");
      if (note.category === "IMPORTANT" && !staff) return send([sid], ">GAME: Note not found.");
      if (note.approved && !staff) return send([sid], ">GAME: That note has been approved and cannot be deleted. Contact staff if you need to remove it.");

      const title = note.title;
      const nid = note.id;
      notes.splice(notes.indexOf(note), 1);
      renumberNotes(notes);
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.notes": notes } as any);
      send([sid], `>GAME: Note #${nid} ('${title}') deleted.`);
    },
  });

  // --------------------------------------------------------------------------
  // +notedecompile — show raw text for copy/paste
  // --------------------------------------------------------------------------
  addCmd({
    name: "+notedecompile",
    pattern: /^\+notedecompile\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;
      const staff = isStaff(playerObj.flags || "");

      const raw = ((u.cmd.args || [])[0] || "").trim();
      if (!raw) return send([sid], ">GAME: Usage: +notedecompile <note>");

      let targetObj = playerObj;
      let noteQuery = raw;
      if (raw.includes("/")) {
        const [targetName, nq] = raw.split("/", 2);
        const found = await lookupPlayer(targetName.trim());
        if (!found) return send([sid], `>GAME: Target '${targetName.trim()}' not found.`);
        targetObj = found;
        noteQuery = nq.trim();
      }

      const notes = getNotes(targetObj.data);
      const note = findNote(notes, noteQuery, staff);
      if (!note) return send([sid], ">GAME: Note not found.");

      const isOwn = targetObj.id === playerObj.id;
      if (!isOwn && !staff && (note.status === "PRIVATE" || note.category === "IMPORTANT")) {
        return send([sid], ">GAME: Note not found.");
      }

      send([sid], `>GAME: Decompile of note #${note.id} (${note.title}):\r\n${note.text}`);
    },
  });

  // --------------------------------------------------------------------------
  // +noteapprove — staff only: approve a note
  // --------------------------------------------------------------------------
  addCmd({
    name: "+noteapprove",
    pattern: /^\+noteapprove\s+(.*)/i,
    lock: "connected & superuser+",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return;

      const raw = ((u.cmd.args || [])[0] || "").trim();
      if (!raw || !raw.includes("/")) return send([sid], ">GAME: Usage: +noteapprove <character>/<note>");

      const [targetName, noteQuery] = raw.split("/", 2);
      const target = await lookupPlayer(targetName.trim());
      if (!target) return send([sid], `>GAME: Target '${targetName.trim()}' not found.`);

      const notes = getNotes(target.data);
      const note = findNote(notes, noteQuery.trim(), true);
      if (!note) return send([sid], ">GAME: Note not found.");

      const staffName = playerObj.data?.moniker || playerObj.data?.name || "Staff";
      note.approved = true;
      note.approved_by = staffName;
      note.approved_at = Date.now();
      await dbojs.modify({ id: target.id }, "$set", { "data.notes": notes } as any);

      send([sid], `>GAME: Note #${note.id} ('${note.title}') on ${target.data?.name || "Unknown"} approved.`);

      if (note.category !== "IMPORTANT") {
        await sendToPlayer(target.id, `>GAME: Your note '${note.title}' has been approved by ${staffName}.`);
      }
    },
  });
}
