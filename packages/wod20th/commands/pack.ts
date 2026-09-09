// commands/pack.ts -- +pack for WtA pack membership and totem binding.
//
// A pack is a Garou social unit. The alpha is the leader and the only
// player who can invite or disband. Invitees must explicitly /accept.
// Totem is set by staff once OOC alignment is confirmed.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findById, findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import { sendMail } from "../db/mailDb.ts";
import {
  createPack,
  deletePack,
  findAllPacks,
  findPackById,
  findPackByName,
  savePack,
  type IPack,
} from "../db/packDb.ts";
import { divider, footer, header } from "../core/format.ts";
import { getSpirit } from "../splats/wta/data/spirits.ts";
import type { IWoDChar } from "../core/types.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function validPackName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Pack name must be at least 2 characters.";
  if (n.length > 40) return "Pack name must be 40 characters or fewer.";
  if (!/^[\w\s'\-]+$/.test(n)) return "Pack name may contain letters, numbers, spaces, apostrophes, and hyphens only.";
  return null;
}

async function memberLine(charId: string, alpha: string): Promise<string> {
  const c = await findById(charId);
  if (!c) return `  %cr??%cn (charId ${charId})`;
  const name = c.moniker || c.fullName || c.deedName || charId;
  const role = charId === alpha ? "%cyAlpha%cn " : "      ";
  const rank = c.rank ? `Rank ${c.rank}` : "";
  return `  ${role} ${name.padEnd(20)} ${rank}`;
}

async function renderPack(pack: IPack): Promise<string> {
  const lines: string[] = [
    header(`Pack: ${pack.name}`),
    `  Members: ${pack.members.length}`,
    `  Totem:   ${pack.totem || "(none)"}${pack.totemRating ? ` (rating ${pack.totemRating})` : ""}`,
    divider("Roster"),
  ];
  for (const id of pack.members) lines.push(await memberLine(id, pack.alpha));
  if (pack.totemBoons.length) {
    lines.push(divider("Totem Boons"));
    for (const b of pack.totemBoons) lines.push(`  - ${b}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderList(packs: IPack[]): Promise<string> {
  const lines: string[] = [header("Packs")];
  if (packs.length === 0) {
    lines.push("  (No packs have been formed.)");
  } else {
    for (const p of packs) {
      lines.push(`  %ch${p.name.padEnd(24)}%cn  ${String(p.members.length).padStart(2)} member(s)` +
        (p.totem ? `   Totem: ${p.totem}` : ""));
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

/** Resolve the actor's character; reject mortals/vtm and kinfolk. */
async function actorGarou(u: IUrsamuSDK): Promise<IWoDChar | null> {
  const char = await findByPlayer(u.me.id);
  if (!char) { u.send("You have no character on file."); return null; }
  if (char.splat !== "wta") { u.send("Only Garou (WtA) characters can join packs."); return null; }
  return char;
}

addCmd({
  name: "+pack",
  pattern: /^\+pack(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+pack[/switch] [<args>]  -- Garou pack membership and totems.

SYNTAX
  +pack                            Show your pack.
  +pack/list                       List all packs.
  +pack/who <name>                 Show a named pack.
  +pack/create <name>              Form a new pack (you become alpha).
  +pack/invite <player>            (Alpha) Invite a player to your pack.
  +pack/accept                     Accept a pending invite.
  +pack/decline                    Decline a pending invite.
  +pack/leave                      Leave your pack.
  +pack/disband                    (Alpha) Disband the pack.
  +pack/totem <pack>/<spirit>=<n>  (Staff) Bind a totem and rating.

SEE ALSO: +help pack, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list ---------------------------------------------------------------
    if (sw === "list") {
      u.send(await renderList(await findAllPacks()));
      return;
    }

    // -- /who <name> ---------------------------------------------------------
    if (sw === "who") {
      if (!arg) {
        // Default: show your own.
        const char = await actorGarou(u);
        if (!char) return;
        if (!char.packId) { u.send("You are not in a pack."); return; }
        const p = await findPackById(char.packId);
        if (!p) { u.send("Your pack record is missing -- ask staff."); return; }
        u.send(await renderPack(p));
        return;
      }
      const p = await findPackByName(arg);
      if (!p) { u.send(`No pack named "${arg}".`); return; }
      u.send(await renderPack(p));
      return;
    }

    // -- /totem (staff) ------------------------------------------------------
    //
    //   +pack/totem <pack>/<spirit>=<rating>
    //
    // Pack names allow [\w\s'-] only (validPackName), so the rightmost
    // "=" splits off the rating and the rightmost "/" splits off the
    // spirit -- both unambiguous.
    if (sw === "totem") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const eqIdx = arg.lastIndexOf("=");
      if (eqIdx < 0) {
        u.send("Usage: +pack/totem <pack>/<spirit>=<rating>");
        return;
      }
      const left = arg.slice(0, eqIdx).trim();
      const ratingStr = arg.slice(eqIdx + 1).trim();
      const slashIdx = left.lastIndexOf("/");
      if (slashIdx < 0) {
        u.send("Usage: +pack/totem <pack>/<spirit>=<rating>");
        return;
      }
      const packName = left.slice(0, slashIdx).trim();
      const spirit   = left.slice(slashIdx + 1).trim();
      if (!packName || !spirit) {
        u.send("Usage: +pack/totem <pack>/<spirit>=<rating>");
        return;
      }
      const rating = parseInt(ratingStr, 10);
      if (!Number.isInteger(rating) || rating < 0 || rating > 7) {
        u.send("Rating must be an integer 0-7."); return;
      }
      const pack = await findPackByName(packName);
      if (!pack) { u.send(`No pack named "${packName}".`); return; }
      // Lookup canonical spirit; if found, auto-populate boons. Otherwise
      // accept as free-form (custom totem) and warn the staffer.
      const def = getSpirit(spirit);
      // Strip any MUSH color codes from custom totem strings as defense in
      // depth -- u.util.stripSubs already strips them from input, but this
      // ensures pack.totem can never carry render-time formatting even if
      // the SDK behavior changes.
      const cleanSpirit = spirit.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, "");
      pack.totem = def ? def.name : cleanSpirit;
      pack.totemRating = rating;
      let extra = "";
      if (def) {
        if (Array.isArray(def.totemBoons) && def.totemBoons.length > 0) {
          if (pack.totemBoons.length === 0) {
            // First-time bind: seed from canonical catalog.
            pack.totemBoons = def.totemBoons.slice();
            extra = ` (boons populated from spirit catalog)`;
          } else {
            // Curated boons already present; merge canonical entries not
            // already on the list so they're not silently lost.
            const present = new Set(pack.totemBoons.map((b) => b.toLowerCase()));
            const additions = def.totemBoons.filter((b) => !present.has(b.toLowerCase()));
            if (additions.length > 0) {
              pack.totemBoons = [...pack.totemBoons, ...additions];
              extra = ` (merged ${additions.length} catalog boon(s); existing curated boons preserved)`;
            } else {
              extra = ` (existing curated boons preserved; all catalog boons already present)`;
            }
          }
        }
      } else {
        extra = ` %cy[warning: "${spirit}" is not in the spirit catalog -- recorded as custom totem]%cn`;
      }
      await savePack(pack);
      u.send(`%cgPack "${pack.name}" totem set to ${pack.totem} (rating ${rating}).%cn${extra}`);
      return;
    }

    // -- /create <name> ------------------------------------------------------
    if (sw === "create") {
      const char = await actorGarou(u);
      if (!char) return;
      if (char.packId) { u.send("You are already in a pack. Use /leave first."); return; }
      const nameErr = validPackName(arg);
      if (nameErr) { u.send(`%cr${nameErr}%cn`); return; }
      const existing = await findPackByName(arg);
      if (existing) { u.send(`A pack named "${existing.name}" already exists.`); return; }
      const pack = await createPack(arg.trim(), char.id);
      char.packId = pack.id;
      await saveChar(char);
      await unsetCharFields(char.id, ["packInvites"]);
      u.send(`%cgPack "${pack.name}" formed. You are alpha.%cn`);
      return;
    }

    // -- /invite <player> ----------------------------------------------------
    if (sw === "invite") {
      const char = await actorGarou(u);
      if (!char) return;
      if (!char.packId) { u.send("You are not in a pack."); return; }
      const pack = await findPackById(char.packId);
      if (!pack) { u.send("Your pack record is missing -- ask staff."); return; }
      if (pack.alpha !== char.id) { u.send("Only the alpha may invite."); return; }
      if (!arg) { u.send("Usage: +pack/invite <player>"); return; }

      const target = await u.util.target(u.me, arg, true);
      if (!target) { u.send("Target not found."); return; }
      const targetChar = await findByPlayer(target.id);
      if (!targetChar) { u.send(`${u.util.displayName(target, u.me)} has no character on file.`); return; }
      if (targetChar.splat !== "wta") { u.send("Only Garou can be invited to a pack."); return; }
      if (targetChar.packId) { u.send(`${u.util.displayName(target, u.me)} is already in a pack.`); return; }
      const existing = targetChar.packInvites ?? [];
      if (existing.includes(pack.id)) {
        u.send(`${u.util.displayName(target, u.me)} already has an invite to "${pack.name}".`);
        return;
      }

      targetChar.packInvites = [...existing, pack.id];
      await saveChar(targetChar);

      // Mail (in-game @mail to the invitee's character).
      const alphaName = char.moniker || char.fullName || char.deedName || "Alpha";
      await sendMail({
        from: `#${char.id}`,
        to: [`#${targetChar.id}`],
        subject: `Pack invite: ${pack.name}`,
        message:
          `${alphaName} invites you to join the pack "${pack.name}".%r%r` +
          `To accept, type:%r  +pack/accept ${pack.name}%r%r` +
          `To decline:%r  +pack/decline ${pack.name}%r%r` +
          (existing.length > 0
            ? `Note: you have ${existing.length + 1} pending invite(s). ` +
              `Use the pack name to disambiguate.%r`
            : ""),
      });

      u.send(`%cgInvite sent to ${u.util.displayName(target, u.me)} (mail delivered).%cn`);
      u.send(
        `%cyYou have been invited to join pack "${pack.name}". ` +
        `Use +pack/accept ${pack.name} or +pack/decline ${pack.name}. ` +
        `(See @mail for details.)%cn`,
        target.id,
      );
      return;
    }

    // -- /accept [<pack>] ----------------------------------------------------
    if (sw === "accept") {
      const char = await actorGarou(u);
      if (!char) return;
      if (char.packId) {
        // Already in a pack -- clear any stale invites.
        if (char.packInvites?.length) await unsetCharFields(char.id, ["packInvites"]);
        u.send("You are already in a pack.");
        return;
      }
      const invites = char.packInvites ?? [];
      if (invites.length === 0) { u.send("You have no pending pack invite."); return; }

      // Resolve which invite to accept.
      let chosen: typeof invites[number] | undefined;
      if (invites.length === 1 && !arg) {
        chosen = invites[0];
      } else if (arg) {
        const named = await findPackByName(arg);
        if (!named) { u.send(`No pack named "${arg}".`); return; }
        if (!invites.includes(named.id)) {
          u.send(`You have no pending invite to "${named.name}".`);
          return;
        }
        chosen = named.id;
      } else {
        // Multiple invites, no arg.
        const names: string[] = [];
        for (const pid of invites) {
          const p = await findPackById(pid);
          if (p) names.push(p.name);
        }
        u.send(`You have multiple pending invites. Specify one: ${names.join(", ")}.`);
        u.send("Usage: +pack/accept <pack>");
        return;
      }

      const pack = await findPackById(chosen);
      if (!pack) {
        // Stale id -- prune it.
        const cleaned = invites.filter((p) => p !== chosen);
        if (cleaned.length === 0) await unsetCharFields(char.id, ["packInvites"]);
        else { char.packInvites = cleaned; await saveChar(char); }
        u.send("That invite is no longer valid (pack disbanded).");
        return;
      }
      pack.members.push(char.id);
      await savePack(pack);
      char.packId = pack.id;
      await saveChar(char);
      // Clear ALL pending invites -- you can only be in one pack.
      await unsetCharFields(char.id, ["packInvites"]);
      u.send(`%cgYou have joined pack "${pack.name}".%cn`);
      return;
    }

    // -- /decline [<pack>] ---------------------------------------------------
    if (sw === "decline") {
      const char = await actorGarou(u);
      if (!char) return;
      const invites = char.packInvites ?? [];
      if (invites.length === 0) { u.send("You have no pending pack invite."); return; }

      if (!arg) {
        if (invites.length === 1) {
          await unsetCharFields(char.id, ["packInvites"]);
          u.send("%cyInvite declined.%cn");
          return;
        }
        const names: string[] = [];
        for (const pid of invites) {
          const p = await findPackById(pid);
          if (p) names.push(p.name);
        }
        u.send(`You have multiple pending invites. Specify one: ${names.join(", ")}.`);
        u.send("Usage: +pack/decline <pack>  (or +pack/decline all)");
        return;
      }

      if (arg.toLowerCase() === "all") {
        await unsetCharFields(char.id, ["packInvites"]);
        u.send(`%cyDeclined ${invites.length} pending invite(s).%cn`);
        return;
      }

      const named = await findPackByName(arg);
      if (!named || !invites.includes(named.id)) {
        u.send(`You have no pending invite to "${arg}".`);
        return;
      }
      const remaining = invites.filter((p) => p !== named.id);
      if (remaining.length === 0) {
        await unsetCharFields(char.id, ["packInvites"]);
      } else {
        char.packInvites = remaining;
        await saveChar(char);
      }
      u.send(`%cyDeclined invite to "${named.name}".%cn`);
      return;
    }

    // -- /leave --------------------------------------------------------------
    if (sw === "leave") {
      const char = await actorGarou(u);
      if (!char) return;
      if (!char.packId) { u.send("You are not in a pack."); return; }
      const pack = await findPackById(char.packId);
      if (!pack) {
        await unsetCharFields(char.id, ["packId"]);
        u.send("Your pack record was missing; cleared.");
        return;
      }
      pack.members = pack.members.filter((m) => m !== char.id);
      await unsetCharFields(char.id, ["packId"]);
      if (pack.members.length === 0) {
        await deletePack(pack.id);
        u.send(`%cyPack "${pack.name}" disbanded (no members left).%cn`);
        return;
      }
      if (pack.alpha === char.id) {
        pack.alpha = pack.members[0];
        await savePack(pack);
        u.send(`%cyYou leave pack "${pack.name}". Alpha role passes to a packmate.%cn`);
        return;
      }
      await savePack(pack);
      u.send(`%cyYou leave pack "${pack.name}".%cn`);
      return;
    }

    // -- /disband ------------------------------------------------------------
    if (sw === "disband") {
      const char = await actorGarou(u);
      if (!char) return;
      if (!char.packId) { u.send("You are not in a pack."); return; }
      const pack = await findPackById(char.packId);
      if (!pack) { u.send("Your pack record is missing."); return; }
      if (pack.alpha !== char.id && !isStaff(u)) {
        u.send("Only the alpha (or staff) may disband.");
        return;
      }
      for (const mid of pack.members) {
        await unsetCharFields(mid, ["packId"]);
      }
      await deletePack(pack.id);
      u.send(`%cyPack "${pack.name}" disbanded.%cn`);
      return;
    }

    if (sw && sw !== "who") { u.send(`Unknown switch: /${sw}. See +help pack.`); return; }

    // No switch -- show own pack.
    const char = await actorGarou(u);
    if (!char) return;
    if (!char.packId) {
      const invites = char.packInvites ?? [];
      if (invites.length > 0) {
        const names: string[] = [];
        for (const pid of invites) {
          const p = await findPackById(pid);
          names.push(p?.name ?? "(missing)");
        }
        if (invites.length === 1) {
          u.send(`%cyPending invite to "${names[0]}". Use +pack/accept or +pack/decline.%cn`);
        } else {
          u.send(
            `%cyPending invites: ${names.join(", ")}. ` +
            `Use +pack/accept <pack> or +pack/decline <pack>.%cn`,
          );
        }
        return;
      }
      u.send("You are not in a pack. Use +pack/create <name> to form one.");
      return;
    }
    const pack = await findPackById(char.packId);
    if (!pack) { u.send("Your pack record is missing -- ask staff."); return; }
    u.send(await renderPack(pack));
  },
});
