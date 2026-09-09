// commands/caern.ts -- +caern for sept/caern administration.
//
// A caern is a sacred node of spiritual power. Staff creates and binds it
// to a room; alphas claim the caern on behalf of their pack; guardians
// (warders) are named by the alpha or staff. Mechanical bonuses are
// exposed via core/caern.ts caernBonus() -- consumed by regen/rite.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findById, findByPlayer } from "../db/charDb.ts";
import { findPackById } from "../db/packDb.ts";
import {
  type CaernLevel,
  createCaern,
  deleteCaern,
  findAllCaerns,
  findCaernByName,
  findCaernByRoom,
  saveCaern,
  type ICaern,
} from "../db/caernDb.ts";
import { divider, footer, header } from "../core/format.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function validCaernName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Caern name must be at least 2 characters.";
  if (n.length > 40) return "Caern name must be 40 characters or fewer.";
  if (!/^[\w\s'\-]+$/.test(n)) {
    return "Caern name may contain letters, numbers, spaces, apostrophes, and hyphens only.";
  }
  return null;
}

async function packLine(packId: string): Promise<string> {
  const p = await findPackById(packId);
  if (!p) return `  %cr??%cn (packId ${packId})`;
  return `  ${p.name.padEnd(24)}  ${p.members.length} member(s)`;
}

async function guardianLine(charId: string): Promise<string> {
  const c = await findById(charId);
  if (!c) return `  %cr??%cn (charId ${charId})`;
  const name = c.moniker || c.fullName || c.deedName || charId;
  return `  %cyWarder%cn  ${name}`;
}

async function renderCaern(caern: ICaern): Promise<string> {
  const lines: string[] = [
    header(`Caern: ${caern.name}`),
    `  Level:    ${caern.level} (${caern.type})`,
    `  Sept:     ${caern.septName || "(unbound)"}`,
    `  Room:     ${caern.locationRoomId || "(unbound)"}`,
    `  Warding:  difficulty ${caern.wardingDifficulty}`,
    divider("Packs"),
  ];
  if (caern.packIds.length === 0) {
    lines.push("  (No packs have claimed this caern.)");
  } else {
    for (const pid of caern.packIds) lines.push(await packLine(pid));
  }
  if (caern.guardians.length) {
    lines.push(divider("Guardians"));
    for (const id of caern.guardians) lines.push(await guardianLine(id));
  }
  if (caern.notes.length) {
    lines.push(divider("Notes"));
    for (const n of caern.notes) lines.push(`  - ${n}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderList(caerns: ICaern[]): Promise<string> {
  const lines: string[] = [header("Caerns")];
  if (caerns.length === 0) {
    lines.push("  (No caerns recorded.)");
  } else {
    for (const c of caerns) {
      lines.push(`  %ch${c.name.padEnd(24)}%cn  L${c.level} ${c.type.padEnd(10)}` +
        `   ${c.packIds.length} pack(s)`);
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

addCmd({
  name: "+caern",
  pattern: /^\+caern(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+caern[/switch] [<args>]  -- Sept / caern administration.

SYNTAX
  +caern                              Show your sept's caern (or list).
  +caern/list                         List all caerns.
  +caern/info <name>                  Show a named caern.
  +caern/create <name>=<level>=<type> (Staff) Create a caern (level 1-5).
  +caern/setroom <name>=<roomId>      (Staff) Bind a caern to a room.
  +caern/claim <name>                 (Alpha) Claim caern for your pack.
  +caern/release <name>               (Alpha) Release your pack's claim.
  +caern/guardian <name>=<player>     (Alpha/Staff) Name a warder.
  +caern/disband <name>               (Staff) Destroy a caern.

SEE ALSO: +help caern, +help sept, +help pack, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list ---------------------------------------------------------------
    if (sw === "list") {
      u.send(await renderList(await findAllCaerns()));
      return;
    }

    // -- /info <name> --------------------------------------------------------
    if (sw === "info") {
      if (!arg) { u.send("Usage: +caern/info <name>"); return; }
      const c = await findCaernByName(arg);
      if (!c) { u.send(`No caern named "${arg}".`); return; }
      u.send(await renderCaern(c));
      return;
    }

    // -- /create <name>=<level>=<type>  (staff) ------------------------------
    if (sw === "create") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const parts = arg.split("=").map((s) => s.trim());
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        u.send("Usage: +caern/create <name>=<level>=<type>");
        return;
      }
      const [name, levelStr, type] = parts;
      const nameErr = validCaernName(name);
      if (nameErr) { u.send(`%cr${nameErr}%cn`); return; }
      const lvl = parseInt(levelStr, 10);
      if (!Number.isInteger(lvl) || lvl < 1 || lvl > 5) {
        u.send("Level must be an integer 1-5."); return;
      }
      if (await findCaernByName(name)) {
        u.send(`A caern named "${name}" already exists.`); return;
      }
      const caern = await createCaern(name, lvl as CaernLevel, type);
      u.send(`%cgCaern "${caern.name}" created (level ${lvl} ${type}).%cn`);
      return;
    }

    // -- /setroom <name>=<roomId>  (staff) -----------------------------------
    if (sw === "setroom") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx < 0) { u.send("Usage: +caern/setroom <name>=<roomId>"); return; }
      const name = arg.slice(0, eqIdx).trim();
      const roomId = arg.slice(eqIdx + 1).trim();
      if (!name || !roomId) {
        u.send("Usage: +caern/setroom <name>=<roomId>"); return;
      }
      const caern = await findCaernByName(name);
      if (!caern) { u.send(`No caern named "${name}".`); return; }

      // Validate the target id resolves to an actual room. Without this,
      // staff could accidentally bind a caern to a player, exit, or thing.
      // deno-lint-ignore no-explicit-any
      let roomObj: any = null;
      try {
        // deno-lint-ignore no-explicit-any
        roomObj = await (u.db as any).get?.(roomId);
      } catch { /* engine variants -- non-fatal */ }
      if (!roomObj) { u.send(`Room "${roomId}" not found.`); return; }
      const flags = roomObj.flags;
      const isRoom = flags instanceof Set
        ? flags.has("room")
        : Array.isArray(flags) ? flags.includes("room") : false;
      if (!isRoom) {
        u.send(`Object "${roomId}" is not a room.`);
        return;
      }

      // Detach any prior binding on that room.
      const prior = await findCaernByRoom(roomId);
      if (prior && prior.id !== caern.id) {
        u.send(`%crRoom ${roomId} is already bound to caern "${prior.name}". ` +
          `Unbind it first.%cn`);
        return;
      }
      caern.locationRoomId = roomId;
      await saveCaern(caern);
      // Mark the room itself so caernBonus() can find it without a DBO scan.
      try {
        await u.db.modify(roomId, "$set", { "state.caernId": caern.id });
      } catch { /* room may be a mock; non-fatal */ }
      u.send(`%cgCaern "${caern.name}" bound to room ${roomId}.%cn`);
      return;
    }

    // -- /claim <name>  (alpha) ----------------------------------------------
    if (sw === "claim") {
      if (!arg) { u.send("Usage: +caern/claim <name>"); return; }
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      if (char.splat !== "wta") {
        u.send("Only Garou (WtA) characters can claim caerns."); return;
      }
      if (!char.packId) { u.send("You are not in a pack."); return; }
      const pack = await findPackById(char.packId);
      if (!pack) { u.send("Your pack record is missing -- ask staff."); return; }
      if (pack.alpha !== char.id) {
        u.send("Only the alpha may claim a caern for the pack."); return;
      }
      const caern = await findCaernByName(arg);
      if (!caern) { u.send(`No caern named "${arg}".`); return; }
      if (caern.packIds.includes(pack.id)) {
        u.send(`Your pack already shares the caern "${caern.name}".`); return;
      }
      caern.packIds = [...caern.packIds, pack.id];
      await saveCaern(caern);
      u.send(`%cgPack "${pack.name}" claims caern "${caern.name}".%cn`);
      return;
    }

    // -- /release <name>  (alpha) --------------------------------------------
    if (sw === "release") {
      if (!arg) { u.send("Usage: +caern/release <name>"); return; }
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      if (char.splat !== "wta") {
        u.send("Only Garou (WtA) characters can release caerns."); return;
      }
      if (!char.packId) { u.send("You are not in a pack."); return; }
      const pack = await findPackById(char.packId);
      if (!pack) { u.send("Your pack record is missing -- ask staff."); return; }
      if (pack.alpha !== char.id) {
        u.send("Only the alpha may release the pack's claim."); return;
      }
      const caern = await findCaernByName(arg);
      if (!caern) { u.send(`No caern named "${arg}".`); return; }
      if (!caern.packIds.includes(pack.id)) {
        u.send(`Your pack does not hold the caern "${caern.name}".`); return;
      }
      caern.packIds = caern.packIds.filter((p) => p !== pack.id);
      await saveCaern(caern);
      u.send(`%cyPack "${pack.name}" releases caern "${caern.name}".%cn`);
      return;
    }

    // -- /guardian <name>=<player>  (alpha or staff) -------------------------
    if (sw === "guardian") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx < 0) { u.send("Usage: +caern/guardian <name>=<player>"); return; }
      const cname = arg.slice(0, eqIdx).trim();
      const pname = arg.slice(eqIdx + 1).trim();
      if (!cname || !pname) {
        u.send("Usage: +caern/guardian <name>=<player>"); return;
      }
      const caern = await findCaernByName(cname);
      if (!caern) { u.send(`No caern named "${cname}".`); return; }

      // Permission: alpha of a pack that holds this caern, or staff.
      let allowed = isStaff(u);
      if (!allowed) {
        const char = await findByPlayer(u.me.id);
        if (char?.packId) {
          const pack = await findPackById(char.packId);
          if (pack && pack.alpha === char.id && caern.packIds.includes(pack.id)) {
            allowed = true;
          }
        }
      }
      if (!allowed) {
        u.send("Only the alpha of a claiming pack (or staff) may name guardians.");
        return;
      }

      const target = await u.util.target(u.me, pname, true);
      if (!target) { u.send(`Player "${pname}" not found.`); return; }
      const tchar = await findByPlayer(target.id);
      if (!tchar) {
        u.send(`${u.util.displayName(target, u.me)} has no character on file.`);
        return;
      }
      if (caern.guardians.includes(tchar.id)) {
        u.send(`${u.util.displayName(target, u.me)} already guards "${caern.name}".`);
        return;
      }
      caern.guardians = [...caern.guardians, tchar.id];
      await saveCaern(caern);
      u.send(`%cgGuardian set: ${u.util.displayName(target, u.me)} now wards ` +
        `caern "${caern.name}".%cn`);
      return;
    }

    // -- /disband <name>  (staff) --------------------------------------------
    if (sw === "disband") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +caern/disband <name>"); return; }
      const caern = await findCaernByName(arg);
      if (!caern) { u.send(`No caern named "${arg}".`); return; }
      if (caern.packIds.length > 0) {
        u.send(`%crCaern "${caern.name}" still has ${caern.packIds.length} pack(s) ` +
          `claiming it. Have them /release first, or use /disband after.%cn`);
        return;
      }
      // Clear the room binding too.
      if (caern.locationRoomId) {
        try {
          await u.db.modify(caern.locationRoomId, "$unset", { "state.caernId": "" });
        } catch { /* non-fatal */ }
      }
      await deleteCaern(caern.id);
      u.send(`%cyCaern "${caern.name}" disbanded.%cn`);
      return;
    }

    if (sw) { u.send(`Unknown switch: /${sw}. See +help caern.`); return; }

    // No switch -- show the caern bound to the actor's pack (first claim),
    // else list all.
    const char = await findByPlayer(u.me.id);
    if (char?.packId) {
      const all = await findAllCaerns();
      const mine = all.find((c) => c.packIds.includes(char.packId!));
      if (mine) { u.send(await renderCaern(mine)); return; }
    }
    u.send(await renderList(await findAllCaerns()));
  },
});
