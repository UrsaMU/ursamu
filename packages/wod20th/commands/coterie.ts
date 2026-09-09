// commands/coterie.ts -- +coterie Kindred social unit (pack analogue).

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  findById,
  findByPlayer,
  saveChar,
  unsetCharFields,
} from "../db/charDb.ts";
import { sendMail } from "../db/mailDb.ts";
import {
  createCoterie,
  deleteCoterie,
  findAllCoteries,
  findCoterieById,
  findCoterieByName,
  saveCoterie,
  type ICoterie,
} from "../db/coterieDb.ts";
import { divider, footer, header } from "../core/format.ts";
import type { IWoDChar } from "../core/types.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function validName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Name must be at least 2 characters.";
  if (n.length > 40) return "Name must be 40 characters or fewer.";
  if (!/^[\w\s'\-]+$/.test(n)) {
    return "Name may contain letters, numbers, spaces, apostrophes, hyphens.";
  }
  return null;
}

async function memberLine(charId: string, leader: string): Promise<string> {
  const c = await findById(charId);
  if (!c) return `  %cr??%cn (${charId})`;
  const name = c.moniker || c.fullName || charId;
  const role = charId === leader ? "%cyLeader%cn" : "      ";
  const clan = c.clan ? ` ${c.clan}` : "";
  return `  ${role} ${name.padEnd(20)}${clan}`;
}

async function renderCoterie(cot: ICoterie): Promise<string> {
  const lines: string[] = [
    header(`Coterie: ${cot.name}`),
    `  Members: ${cot.members.length}`,
    `  Purpose: ${cot.purpose || "(none)"}`,
    cot.domainId ? `  Domain:  ${cot.domainId}` : "  Domain:  (none)",
    divider("Roster"),
  ];
  for (const id of cot.members) {
    lines.push(await memberLine(id, cot.leader));
  }
  lines.push(footer());
  return lines.join("%r");
}

async function actorKindred(u: IUrsamuSDK): Promise<IWoDChar | null> {
  const char = await findByPlayer(u.me.id);
  if (!char) {
    u.send("You have no character on file.");
    return null;
  }
  if (char.splat !== "vtm") {
    u.send("Only Kindred form coteries.");
    return null;
  }
  return char;
}

addCmd({
  name: "+coterie",
  pattern: /^\+coterie(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+coterie[/switch] [<args>]  -- Kindred coterie membership.

SYNTAX
  +coterie                     Show your coterie.
  +coterie/list                List all coteries.
  +coterie/who <name>          Show a named coterie.
  +coterie/create <name>       Form a coterie (you lead).
  +coterie/invite <player>     (Leader) Invite.
  +coterie/accept              Accept invite.
  +coterie/decline             Decline invite.
  +coterie/leave               Leave.
  +coterie/disband             (Leader) Disband.
  +coterie/purpose <text>      (Leader) Set purpose.

SEE ALSO: +help domain, +help boon, +help pack`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "list") {
      const all = await findAllCoteries();
      const lines = [header("Coteries")];
      if (!all.length) lines.push("  (None formed.)");
      else {
        for (const c of all) {
          lines.push(
            `  %ch${c.name.padEnd(24)}%cn  ` +
              `${String(c.members.length).padStart(2)} member(s)`,
          );
        }
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "who") {
      if (!arg) {
        u.send("Usage: +coterie/who <name>");
        return;
      }
      const cot = await findCoterieByName(arg);
      if (!cot) {
        u.send("Coterie not found.");
        return;
      }
      u.send(await renderCoterie(cot));
      return;
    }

    if (sw === "create") {
      const char = await actorKindred(u);
      if (!char) return;
      if (char.coterieId) {
        u.send("You already belong to a coterie. +coterie/leave first.");
        return;
      }
      const err = validName(arg);
      if (err) {
        u.send(err);
        return;
      }
      if (await findCoterieByName(arg)) {
        u.send("A coterie with that name already exists.");
        return;
      }
      const cot = await createCoterie(arg.trim(), char.id);
      char.coterieId = cot.id;
      char.coterieInvites = undefined;
      await saveChar(char);
      u.send(`%cgCoterie "%ch${cot.name}%cn" formed. You lead.%cn`);
      return;
    }

    if (sw === "invite") {
      const char = await actorKindred(u);
      if (!char) return;
      if (!char.coterieId) {
        u.send("You have no coterie.");
        return;
      }
      const cot = await findCoterieById(char.coterieId);
      if (!cot || cot.leader !== char.id) {
        u.send("Only the leader can invite.");
        return;
      }
      if (!arg) {
        u.send("Usage: +coterie/invite <player>");
        return;
      }
      const target = await u.util.target(u.me, arg, true);
      if (!target) {
        u.send("Player not found.");
        return;
      }
      const tc = await findByPlayer(target.id);
      if (!tc || tc.splat !== "vtm") {
        u.send("Target has no Kindred character.");
        return;
      }
      if (tc.coterieId) {
        u.send("They already belong to a coterie.");
        return;
      }
      const invites = [...(tc.coterieInvites ?? [])];
      if (!invites.includes(cot.id)) invites.push(cot.id);
      tc.coterieInvites = invites;
      await saveChar(tc);
      await sendMail({
        from: `#${u.me.id}`,
        to: [`#${target.id}`],
        subject: `Coterie invite: ${cot.name}`,
        message:
          `${u.util.displayName(u.me, u.me)} invites you to coterie ` +
          `"${cot.name}". +coterie/accept or /decline.`,
      });
      u.send(`Invite sent to ${u.util.displayName(target, u.me)}.`);
      return;
    }

    if (sw === "accept" || sw === "decline") {
      const char = await actorKindred(u);
      if (!char) return;
      const invites = char.coterieInvites ?? [];
      if (!invites.length) {
        u.send("No pending coterie invites.");
        return;
      }
      const cotId = invites[0];
      const cot = await findCoterieById(cotId);
      if (sw === "decline") {
        char.coterieInvites = invites.slice(1);
        await saveChar(char);
        u.send("Invite declined.");
        return;
      }
      if (!cot) {
        char.coterieInvites = invites.slice(1);
        await saveChar(char);
        u.send("That coterie no longer exists.");
        return;
      }
      if (char.coterieId) {
        u.send("Leave your current coterie first.");
        return;
      }
      cot.members.push(char.id);
      await saveCoterie(cot);
      char.coterieId = cot.id;
      char.coterieInvites = undefined;
      await saveChar(char);
      u.send(`%cgJoined coterie "%ch${cot.name}%cn".%cn`);
      return;
    }

    if (sw === "leave") {
      const char = await actorKindred(u);
      if (!char) return;
      if (!char.coterieId) {
        u.send("You are not in a coterie.");
        return;
      }
      const cot = await findCoterieById(char.coterieId);
      if (!cot) {
        await unsetCharFields(char.id, ["coterieId"]);
        u.send("Coterie record was missing; cleared.");
        return;
      }
      if (cot.leader === char.id) {
        u.send("Leader must +coterie/disband or transfer lead first.");
        return;
      }
      cot.members = cot.members.filter((id) => id !== char.id);
      await saveCoterie(cot);
      await unsetCharFields(char.id, ["coterieId"]);
      u.send("You left the coterie.");
      return;
    }

    if (sw === "disband") {
      const char = await actorKindred(u);
      if (!char) return;
      if (!char.coterieId) {
        u.send("No coterie.");
        return;
      }
      const cot = await findCoterieById(char.coterieId);
      if (!cot || (cot.leader !== char.id && !isStaff(u))) {
        u.send("Only the leader (or staff) can disband.");
        return;
      }
      for (const mid of cot.members) {
        const m = await findById(mid);
        if (m?.coterieId === cot.id) {
          await unsetCharFields(m.id, ["coterieId"]);
        }
      }
      await deleteCoterie(cot.id);
      u.send(`Coterie "${cot.name}" disbanded.`);
      return;
    }

    if (sw === "purpose") {
      const char = await actorKindred(u);
      if (!char?.coterieId) {
        u.send("No coterie.");
        return;
      }
      const cot = await findCoterieById(char.coterieId);
      if (!cot || cot.leader !== char.id) {
        u.send("Only the leader sets purpose.");
        return;
      }
      cot.purpose = arg.slice(0, 200);
      await saveCoterie(cot);
      u.send(`Purpose set: ${cot.purpose || "(cleared)"}`);
      return;
    }

    // default: show own
    const char = await actorKindred(u);
    if (!char) return;
    if (!char.coterieId) {
      u.send(
        "You are not in a coterie. " +
          "+coterie/create <name> or wait for an invite.",
      );
      if ((char.coterieInvites?.length ?? 0) > 0) {
        u.send(
          `Pending invites: ${char.coterieInvites!.length} ` +
            `(+coterie/accept).`,
        );
      }
      return;
    }
    const cot = await findCoterieById(char.coterieId);
    if (!cot) {
      u.send("Coterie record missing -- ask staff.");
      return;
    }
    u.send(await renderCoterie(cot));
  },
});
