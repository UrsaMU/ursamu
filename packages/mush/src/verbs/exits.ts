import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";


// ── @zone ─────────────────────────────────────────────────────────────────────

interface IZoneMembership {
  id: string;
  zmId: string;
  memberId: string;
}

// Lazy import so zone DBO is only needed when the command fires.
async function getZoneMemberships() {
  const { zoneMemberships } = await import("../world/dbobjs.ts");
  return zoneMemberships as unknown as {
    find(q: Record<string, unknown>): Promise<IZoneMembership[]>;
    findOne(q: Record<string, unknown>): Promise<IZoneMembership | null>;
    create(d: IZoneMembership): Promise<IZoneMembership>;
    delete(q: Record<string, unknown>): Promise<void>;
  };
}

function isStaff(flags: Set<string>): boolean {
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

addCmd({
  name: "@zone",
  pattern: /^@zone(?:\/([\w]+))?\s+(.+?)(?:=(.+))?$/i,
  lock: "connected",
  category: "Building",
  help: `@zone[/<switch>] <object>[=<zonemaster>]  — Manage zone membership.

SWITCHES
  /add      Add <object> to <zonemaster> (builder+).
  /del      Remove <object> from <zonemaster> (builder+).
  /purge    Remove <object> from ALL zones (builder+).
  /replace  Replace <oldZM>/<newZM> on <object> (builder+).
  /list     List zones <object> belongs to (default).

EXAMPLES
  @zone me
  @zone/add me=#5
  @zone/del me=#5
  @zone/purge widget
  @zone/replace me=#5/#6`,
  exec: async (u: IUrsamuSDK) => {
    const sw     = (u.cmd.args[0] ?? "list").toLowerCase().trim() || "list";
    const objRef = (u.cmd.args[1] ?? "").trim();
    const zmRef  = (u.cmd.args[2] ?? "").trim();

    if (!objRef) { u.send("Usage: @zone[/switch] <object>[=<zonemaster>]"); return; }

    const zm = await getZoneMemberships();
    const objResult = await u.util.target(u.me, objRef);
    if (!objResult) { u.send(`I can't find '${objRef}'.`); return; }

    if (sw === "list") {
      const asZM = await zm.find({ zmId: objResult.id });
      if (asZM.length > 0) {
        const memberIds = asZM.map((m) => m.memberId);
        const memberObjs = await Promise.all(memberIds.map((id) => u.util.target(u.me, `#${id}`)));
        u.send(`%chMembers of zone master #${objResult.id}:%cn`);
        for (let i = 0; i < asZM.length; i++) {
          const member = memberObjs[i];
          u.send(`  ${member?.name ?? asZM[i].memberId}(#${asZM[i].memberId})`);
        }
      } else {
        const zones = await zm.find({ memberId: objResult.id });
        if (zones.length === 0) {
          u.send(`${objResult.name}(#${objResult.id}) is not in any zone.`);
        } else {
          u.send(`%chZones for #${objResult.id}:%cn`);
          for (const z of zones) {
            const master = await u.util.target(u.me, `#${z.zmId}`);
            u.send(`  ${master?.name ?? z.zmId}(#${z.zmId})`);
          }
        }
      }
      return;
    }

    const isBuilder = u.me.flags.has("builder") || isStaff(u.me.flags);
    if (!isBuilder) { u.send("Permission denied. (builder+ required)"); return; }

    const staff = isStaff(u.me.flags);
    const objOwner = objResult.state?.owner as string | undefined;
    if (!staff && objOwner !== u.me.id && objResult.id !== u.me.id) {
      u.send("Permission denied. You don't control that object.");
      return;
    }

    if (sw === "add") {
      if (!zmRef) { u.send("Usage: @zone/add <object>=<zonemaster>"); return; }
      const zmResult = await u.util.target(u.me, zmRef);
      if (!zmResult) { u.send(`I can't find zone master '${zmRef}'.`); return; }
      const key = `${zmResult.id}:${objResult.id}`;
      const existing = await zm.findOne({ id: key });
      if (existing) { u.send(`${objResult.name} is already in zone #${zmResult.id}.`); return; }
      await zm.create({ id: key, zmId: zmResult.id, memberId: objResult.id });
      u.send(`${objResult.name}(#${objResult.id}) added to zone ${zmResult.name}(#${zmResult.id}).`);
      return;
    }

    if (sw === "del") {
      if (!zmRef) { u.send("Usage: @zone/del <object>=<zonemaster>"); return; }
      const zmResult = await u.util.target(u.me, zmRef);
      if (!zmResult) { u.send(`I can't find zone master '${zmRef}'.`); return; }
      const key = `${zmResult.id}:${objResult.id}`;
      const existing = await zm.findOne({ id: key });
      if (!existing) { u.send(`${objResult.name} is not in zone #${zmResult.id}.`); return; }
      await zm.delete({ id: key });
      u.send(`${objResult.name}(#${objResult.id}) removed from zone #${zmResult.id}.`);
      return;
    }

    if (sw === "purge") {
      const asMember = await zm.find({ memberId: objResult.id });
      const asZM2    = await zm.find({ zmId: objResult.id });
      const all      = [...asMember, ...asZM2];
      for (const entry of all) await zm.delete({ id: entry.id });
      u.send(`Purged ${all.length} zone entr${all.length === 1 ? "y" : "ies"} for #${objResult.id}.`);
      return;
    }

    if (sw === "replace") {
      if (!zmRef || !zmRef.includes("/")) { u.send("Usage: @zone/replace <object>=<oldZM>/<newZM>"); return; }
      const [oldRef, newRef] = zmRef.split("/");
      const oldZM = await u.util.target(u.me, oldRef.trim());
      const newZM = await u.util.target(u.me, newRef.trim());
      if (!oldZM) { u.send(`I can't find old zone master '${oldRef}'.`); return; }
      if (!newZM) { u.send(`I can't find new zone master '${newRef}'.`); return; }
      const oldKey = `${oldZM.id}:${objResult.id}`;
      const existing = await zm.findOne({ id: oldKey });
      if (!existing) { u.send(`${objResult.name} is not in zone #${oldZM.id}.`); return; }
      await zm.delete({ id: oldKey });
      await zm.create({ id: `${newZM.id}:${objResult.id}`, zmId: newZM.id, memberId: objResult.id });
      u.send(`Replaced zone #${oldZM.id} with #${newZM.id} on #${objResult.id}.`);
      return;
    }

    u.send(`Unknown @zone switch: /${sw}. See 'help @zone'.`);
  },
});
