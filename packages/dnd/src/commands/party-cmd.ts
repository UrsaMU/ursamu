/**
 * +party — invite allies for delve coordination.
 */
import { addCmd, DBO, type IUrsamuSDK } from "@ursamu/mush";
import { roomIdOf } from "../combat/session.ts";

interface PartyRec {
  id: string;
  leaderId: string;
  memberIds: string[];
  name: string;
  at: number;
}

interface InviteRec {
  id: string;
  fromId: string;
  toId: string;
  partyId: string;
  at: number;
}

const parties = new DBO<PartyRec>("dnd.parties");
const invites = new DBO<InviteRec>("dnd.party_invites");

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

async function partyOf(
  playerId: string,
): Promise<PartyRec | null> {
  const all = await parties.all();
  return all.find((p) =>
    p.leaderId === playerId ||
    p.memberIds.includes(playerId)
  ) ?? null;
}

addCmd({
  name: "+party",
  pattern: /^\+party(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+party — Show your party.\n` +
    `+party/invite <player> — Invite (same room).\n` +
    `+party/accept — Accept latest invite.\n` +
    `+party/leave — Leave party.\n` +
    `+party/kick <player> — Leader only.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "status" || sw === "who") {
      const p = await partyOf(u.me.id);
      if (!p) {
        u.send(
          "%ch%cyPARTY>>%cn Solo. Invite allies: " +
            "+party/invite <name> (same room), then delve.",
        );
        return;
      }
      u.send(
        `%ch%cyPARTY>>%cn ${p.name} — leader #${p.leaderId}`,
      );
      u.send(
        `  Members: ${[p.leaderId, ...p.memberIds].join(", ")}`,
      );
      u.send(
        "Stand together and +adv/delve — size includes " +
          "PCs here + hirelings.",
      );
      return;
    }

    if (sw === "invite") {
      if (!arg) {
        u.send("Usage: +party/invite <player>");
        return;
      }
      const roomId = roomIdOf(u);
      const target = await u.util.target(u.me, arg, true);
      if (!target) {
        u.send("Not found.");
        return;
      }
      if (!target.flags.has("player")) {
        u.send("Invite players only (use +hire for NPCs).");
        return;
      }
      if (roomId && target.location !== roomId) {
        u.send("They must be in the same room.");
        return;
      }
      let p = await partyOf(u.me.id);
      if (!p) {
        p = {
          id: `party-${u.me.id}`,
          leaderId: u.me.id,
          memberIds: [],
          name: `${u.me.name?.split(";")[0]}'s Party`,
          at: Date.now(),
        };
        await parties.update({ id: p.id }, p);
      }
      if (p.leaderId !== u.me.id && !isStaff(u)) {
        u.send("Only the leader can invite.");
        return;
      }
      if (
        p.memberIds.includes(target.id) ||
        p.leaderId === target.id
      ) {
        u.send("Already in the party.");
        return;
      }
      const inv: InviteRec = {
        id: `inv-${target.id}`,
        fromId: u.me.id,
        toId: target.id,
        partyId: p.id,
        at: Date.now(),
      };
      await invites.update({ id: inv.id }, inv);
      u.send(
        `%ch%cyPARTY>>%cn Invited ` +
          `${u.util.displayName(target, u.me)}.`,
      );
      u.send(
        "They should: +party/accept",
        target.id,
      );
      return;
    }

    if (sw === "accept") {
      const inv = await invites.queryOne({
        id: `inv-${u.me.id}`,
      });
      if (!inv) {
        u.send("No pending invite.");
        return;
      }
      const p = await parties.queryOne({ id: inv.partyId });
      if (!p) {
        u.send("Party gone.");
        await invites.delete({ id: inv.id });
        return;
      }
      if (!p.memberIds.includes(u.me.id)) {
        p.memberIds = [...p.memberIds, u.me.id];
        await parties.update({ id: p.id }, p);
      }
      await invites.delete({ id: inv.id });
      // tag sheet
      await u.db.modify(u.me.id, "$set", {
        "data.dndPartyId": p.id,
      });
      u.send(
        `%ch%cgPARTY>>%cn Joined %ch${p.name}%cn. ` +
          `Gather and +adv/delve.`,
      );
      u.send(
        `${u.util.displayName(u.me, u.me)} joined the party.`,
        p.leaderId,
      );
      return;
    }

    if (sw === "leave") {
      const p = await partyOf(u.me.id);
      if (!p) {
        u.send("Not in a party.");
        return;
      }
      if (p.leaderId === u.me.id) {
        await parties.delete({ id: p.id });
        u.send(
          "%ch%cyPARTY>>%cn Party disbanded (you were leader).",
        );
      } else {
        p.memberIds = p.memberIds.filter((id) => id !== u.me.id);
        await parties.update({ id: p.id }, p);
        u.send("%ch%cyPARTY>>%cn You left the party.");
      }
      await u.db.modify(u.me.id, "$unset", {
        "data.dndPartyId": "",
      });
      return;
    }

    if (sw === "kick") {
      const p = await partyOf(u.me.id);
      if (!p || p.leaderId !== u.me.id) {
        u.send("Leader only.");
        return;
      }
      const target = await u.util.target(u.me, arg, true);
      if (!target || !p.memberIds.includes(target.id)) {
        u.send("Not a member.");
        return;
      }
      p.memberIds = p.memberIds.filter((id) => id !== target.id);
      await parties.update({ id: p.id }, p);
      u.send(`Kicked ${target.name}.`);
      u.send("You were removed from the party.", target.id);
      return;
    }

    u.send(
      "Switches: /invite /accept /leave /kick /status",
    );
  },
});
