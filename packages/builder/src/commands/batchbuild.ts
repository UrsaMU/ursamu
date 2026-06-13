/**
 * @batchbuild — Build file save/run commands (native addCmd, admin+ only).
 *
 * Requires native context for filesystem access (Deno.readTextFile /
 * Deno.writeTextFile). Build files live in <game_root>/builds/.
 */

import { addCmd, dbojs } from "@ursamu/mush";
import { join } from "jsr:@std/path";
import type { IUrsamuSDK } from "@ursamu/mush";

// ─── constants ────────────────────────────────────────────────────────────────

const BUILDS_DIR = join(Deno.cwd(), "builds");
const MAX_LINES  = 2000;

// ─── helpers ──────────────────────────────────────────────────────────────────

function isAdmin(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function safeName(name: string): string | null {
  // Allow letters, digits, hyphens, underscores only — no path traversal
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : null;
}

/**
 * Replace CR and LF characters with MUSH %r to prevent script injection.
 *
 * Build scripts are plain text files where each line is an in-game command.
 * A raw \n inside a room description or name would split into a separate line,
 * which `@batchbuild/run` would then execute as an independent command.
 * Replacing with %r preserves the visual newline when the game renders the
 * description, without creating an additional executable script line.
 */
function sanitizeForScript(s: string): string {
  return s.replace(/[\r\n]+/g, "%r");
}

async function ensureBuildsDir(): Promise<void> {
  try {
    await Deno.mkdir(BUILDS_DIR, { recursive: true });
  } catch (e: unknown) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
}

async function findZmo(name: string) {
  const all   = await dbojs.find({ flags: /zone/i });
  const clean = name.trim().toLowerCase();
  return all.find((z: Record<string, unknown>) => {
    const zName = ((z.data as Record<string, unknown>)?.name as string ?? "").toLowerCase();
    const zId   = z.id as string;
    return zId === clean.replace(/^#/, "") || zName === clean;
  }) ?? null;
}

/** Walk a zone's rooms and their exits, returning a deterministic build script. */
async function generateScript(zmo: Awaited<ReturnType<typeof findZmo>>): Promise<string> {
  if (!zmo) return "";

  const zoneName = (zmo.data as Record<string, unknown>)?.name as string ?? zmo.id;
  const allRooms = await dbojs.find({ flags: /room/i });
  const rooms    = allRooms.filter((r: Record<string, unknown>) =>
    ((r.data as Record<string, unknown>)?.zone) === (zmo.id as string)
  );

  const now  = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# UrsaMU Build Script`,
    `# Zone: ${zoneName} (#${zmo.id as string})`,
    `# Generated: ${now}`,
    `# Rooms: ${rooms.length}`,
    `#`,
    `# How to run: @batchbuild/run <filename>`,
    `# Each non-blank, non-comment line is executed as an in-game command.`,
    `# @dig/teleport moves you into each room before describing/linking it.`,
    ``,
  ];

  // Collect all exits grouped by source room for linking passes
  const exits = await dbojs.find({ flags: /exit/i });

  for (const rawRoom of rooms) {
    const room     = rawRoom as Record<string, unknown>;
    const roomData = room.data as Record<string, unknown> ?? {};
    const roomId   = room.id as string;
    const roomName = roomData.name as string ?? `Room #${roomId}`;
    const desc     = roomData.description as string ?? "";
    const roomExits = exits.filter((e: Record<string, unknown>) => e.location === roomId);

    lines.push(`# ─── Room: ${roomName} (#${roomId}) ───`);
    lines.push(`@dig/teleport ${sanitizeForScript(roomName)}`);

    if (desc) lines.push(`@describe here=${sanitizeForScript(desc)}`);

    lines.push(`@zone/add here=${sanitizeForScript(zoneName)}`);

    for (const rawExit of roomExits) {
      const exit     = rawExit as Record<string, unknown>;
      const exitData = exit.data as Record<string, unknown> ?? {};
      const exitName = exitData.name as string ?? "Exit";
      const destId   = exitData.destination as string ?? "";
      const destRoom = rooms.find((r: Record<string, unknown>) => r.id === destId);
      // Only emit exits whose destination is inside this zone — cross-zone
      // exits reference external IDs and can't be safely reconstructed.
      if (destRoom) {
        const destData = (destRoom as Record<string, unknown>).data as Record<string, unknown> ?? {};
        const destName = destData.name as string ?? `#${destId}`;
        lines.push(`@open ${sanitizeForScript(exitName)}=${sanitizeForScript(destName)}`);
      } else if (destId) {
        lines.push(`# @open ${sanitizeForScript(exitName)}=#${destId}  (cross-zone exit — restore manually)`);
      }
    }

    lines.push(``);
  }

  return lines.join("\n");
}

// ─── /save ────────────────────────────────────────────────────────────────────

async function handleSave(u: IUrsamuSDK, arg: string) {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @batchbuild/save <zone>=<filename>"); return; }

  const zoneName  = arg.slice(0, eqIdx).trim();
  const rawFile   = arg.slice(eqIdx + 1).trim();

  if (!zoneName || !rawFile) { u.send("Usage: @batchbuild/save <zone>=<filename>"); return; }

  const fileName = safeName(rawFile);
  if (!fileName) {
    u.send("Filename may only contain letters, digits, hyphens, and underscores.");
    return;
  }

  const zmo = await findZmo(zoneName);
  if (!zmo) { u.send(`No zone found matching "${zoneName}".`); return; }

  const script = await generateScript(zmo);
  if (!script) { u.send("Zone has no rooms to export."); return; }

  await ensureBuildsDir();
  const filePath = join(BUILDS_DIR, `${fileName}.txt`);
  await Deno.writeTextFile(filePath, script);

  const lineCount = script.split("\n").filter(l => l && !l.startsWith("#")).length;
  u.send(
    `%chZone%cn %ch${zmo.data?.name as string}%cn saved to %chbuilds/${fileName}.txt%cn ` +
    `(${lineCount} command${lineCount === 1 ? "" : "s"}).`
  );
}

// ─── /run ─────────────────────────────────────────────────────────────────────

async function handleRun(u: IUrsamuSDK, rawFile: string) {
  if (!rawFile) { u.send("Usage: @batchbuild/run <filename>"); return; }

  const fileName = safeName(rawFile.replace(/\.txt$/i, ""));
  if (!fileName) {
    u.send("Filename may only contain letters, digits, hyphens, and underscores.");
    return;
  }

  const filePath = join(BUILDS_DIR, `${fileName}.txt`);

  let content: string;
  try {
    content = await Deno.readTextFile(filePath);
  } catch {
    u.send(`Build file "builds/${fileName}.txt" not found.`);
    return;
  }

  const allLines = content.split("\n");
  const commands = allLines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));

  if (commands.length === 0) { u.send("Build file has no commands."); return; }
  if (commands.length > MAX_LINES) {
    u.send(`Build file too large (${commands.length} commands; max ${MAX_LINES}).`);
    return;
  }

  u.send(`%chRunning build file%cn %ch${fileName}.txt%cn — ${commands.length} command${commands.length === 1 ? "" : "s"}...`);

  let executed = 0;
  let failed   = 0;

  for (const cmd of commands) {
    try {
      await u.forceAs(u.me.id, cmd);
      executed++;
    } catch (e: unknown) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      u.send(`%cr[batchbuild]%cn Error on %ch${cmd}%cn: ${msg}`);
    }
  }

  u.send(
    `%chBuild complete.%cn ` +
    `${executed} command${executed === 1 ? "" : "s"} executed` +
    (failed > 0 ? `, %cr${failed} failed%cn` : ".")
  );
}

// ─── /list ────────────────────────────────────────────────────────────────────

async function handleList(u: IUrsamuSDK) {
  await ensureBuildsDir();

  const entries: string[] = [];
  for await (const entry of Deno.readDir(BUILDS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".txt")) {
      entries.push(entry.name);
    }
  }

  if (entries.length === 0) { u.send("No build files saved yet."); return; }

  entries.sort();
  const lines: string[] = [u.util.center("%ch=== Build Files ===%cn", 78, "=")];
  for (const name of entries) {
    lines.push(`  ${name}`);
  }
  lines.push("=".repeat(78));
  u.send(lines.join("\r\n"));
}

// ─── command registration ─────────────────────────────────────────────────────

export function registerBatchBuildCmd(): void {
  addCmd({
    name: "@batchbuild",
    pattern: /^@batchbuild(?:\/(\S+))?\s*(.*)?/i,
    lock: "connected admin+",
    category: "Building",
    help: `@batchbuild[/<switch>] <args>  — Save and run zone build scripts (admin+ only).

Switches:
  /save <zone>=<filename>   Export a zone's rooms and exits to builds/<filename>.txt.
  /run <filename>           Execute all commands in a build file, line by line.
  /list                     List all saved build files.

Build file format:
  Each non-blank line is executed as an in-game command.
  Lines starting with # are comments and are skipped.
  Use @dig/teleport to create a room and step into it, then
  @describe, @open, and @zone/add to fill it out.

Examples:
  @batchbuild/save Market District=market   Save zone "Market District" to builds/market.txt.
  @batchbuild/run market                    Execute builds/market.txt.
  @batchbuild/list                          List all saved build files.`,

    exec: async (u: IUrsamuSDK) => {
      if (!isAdmin(u)) { u.send("Permission denied."); return; }

      const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

      if (sw === "save")   return handleSave(u, arg);
      if (sw === "run")    return handleRun(u, arg);
      if (sw === "list")   return handleList(u);

      u.send(
        "Usage:%r" +
        "  @batchbuild/save <zone>=<filename>%r" +
        "  @batchbuild/run <filename>%r" +
        "  @batchbuild/list"
      );
    },
  });
}
