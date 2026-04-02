import { addCmd } from "../services/commands/index.ts";
import { dbojs, zoneMemberships } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { isStaff, target } from "../utils/index.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

/**
 * @zone — zone master management.
 *
 * Zone masters are objects whose $commands fire for all zone members
 * (analogous to parents but for command dispatch, not attribute inheritance).
 *
 * Data:
 *   - zoneMemberships DBO: { id: "${zmId}:${memberId}", zmId, memberId }
 *   - Indexed by both zmId and memberId for O(1) lookups in both directions.
 */
export default () =>
  addCmd({
    name: "@zone",
    pattern: /^@zone(?:\/([\w]+))?\s+(.+?)(?:=(.+))?$/i,
    lock: "connected",
    category: "Building",
    help: `@zone[/<switch>] <object>[=<zonemaster>]

Add and remove objects from zone masters. An object may belong to multiple
zones. Zone masters can have $commands that fire for all zone members.

Switches:
  /add      Add <object> to <zonemaster> (builder+).
  /del      Remove <object> from <zonemaster> (builder+).
  /purge    Remove <object> from ALL its zones (builder+).
  /replace  @zone/replace <obj>=<oldZM>/<newZM> (builder+).
  /list     (default) List the zones <object> belongs to, or if <object>
            is a zone master, list its members.

Examples:
  @zone me                   List zones you belong to.
  @zone/add me=#5            Add yourself to zone master #5.
  @zone/del me=#5            Remove yourself from zone master #5.
  @zone/purge widget         Remove widget from all its zones.
  @zone/replace me=#5/#6     Replace zone #5 with #6 on yourself.
  @zone #5                   List members of zone master #5.`,
    exec: async (u: IUrsamuSDK) => {
      const sw      = (u.cmd.args[0] ?? "list").toLowerCase().trim() || "list";
      const objRef  = (u.cmd.args[1] ?? "").trim();
      const zmRef   = (u.cmd.args[2] ?? "").trim();

      if (!objRef) return u.send("Usage: @zone[/switch] <object>[=<zonemaster>]");

      const isBuilder = u.me.flags.has("builder") || u.me.flags.has("admin")
        || u.me.flags.has("wizard") || u.me.flags.has("superuser");

      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const objResult = await target(en as unknown as IDBOBJ, objRef);
      if (!objResult) return send([u.socketId ?? ""], `I can't find '${objRef}'.`);

      // ── /list ──────────────────────────────────────────────────────────
      if (sw === "list") {
        // Check if target is a zone master (has any members)
        const asZM = await zoneMemberships.find({ zmId: objResult.id });
        if (asZM.length > 0) {
          // Batch-fetch all members in one query instead of N sequential lookups.
          const memberIds = asZM.map(m => m.memberId);
          const memberObjs = await dbojs.find({ id: { $in: memberIds } });
          const memberMap = new Map(memberObjs.map(o => [o.id, o]));
          u.send(`%chMembers of zone master #${objResult.id}:%cn`);
          for (const m of asZM) {
            const member = memberMap.get(m.memberId);
            u.send(`  ${member?.data?.name ?? m.memberId}(#${m.memberId})`);
          }
        } else {
          const zones = await zoneMemberships.find({ memberId: objResult.id });
          if (zones.length === 0) {
            u.send(`${objResult.data?.name ?? objResult.id}(#${objResult.id}) is not in any zone.`);
          } else {
            // Batch-fetch all zone masters.
            const zmIds = zones.map(z => z.zmId);
            const zmObjs = await dbojs.find({ id: { $in: zmIds } });
            const zmMap = new Map(zmObjs.map(o => [o.id, o]));
            u.send(`%chZones for #${objResult.id}:%cn`);
            for (const z of zones) {
              const zm = zmMap.get(z.zmId);
              u.send(`  ${zm?.data?.name ?? z.zmId}(#${z.zmId})`);
            }
          }
        }
        return;
      }

      // All write operations require builder+
      if (!isBuilder) return u.send("Permission denied. (builder+ required)");

      // Ownership check: non-staff builders can only modify zone memberships
      // for objects they own or control. Staff bypass this check.
      const staff = isStaff(u.me.flags);
      const objOwner = objResult.data?.owner as string | undefined;
      const actorOwnsObj = objOwner === u.me.id || objResult.id === u.me.id;
      if (!staff && !actorOwnsObj) return u.send("Permission denied. You don't control that object.");

      // ── /add ───────────────────────────────────────────────────────────
      if (sw === "add") {
        if (!zmRef) return u.send("Usage: @zone/add <object>=<zonemaster>");
        const zmResult = await target(en as unknown as IDBOBJ, zmRef);
        if (!zmResult) return send([u.socketId ?? ""], `I can't find zone master '${zmRef}'.`);

        const key = `${zmResult.id}:${objResult.id}`;
        const existing = await zoneMemberships.findOne({ id: key });
        if (existing) return u.send(`${objResult.data?.name ?? objResult.id} is already in zone #${zmResult.id}.`);

        await zoneMemberships.create({ id: key, zmId: zmResult.id, memberId: objResult.id });
        u.send(`${objResult.data?.name ?? objResult.id}(#${objResult.id}) added to zone ${zmResult.data?.name ?? zmResult.id}(#${zmResult.id}).`);
        return;
      }

      // ── /del ───────────────────────────────────────────────────────────
      if (sw === "del") {
        if (!zmRef) return u.send("Usage: @zone/del <object>=<zonemaster>");
        const zmResult = await target(en as unknown as IDBOBJ, zmRef);
        if (!zmResult) return send([u.socketId ?? ""], `I can't find zone master '${zmRef}'.`);

        const key = `${zmResult.id}:${objResult.id}`;
        const existing = await zoneMemberships.findOne({ id: key });
        if (!existing) return u.send(`${objResult.data?.name ?? objResult.id} is not in zone #${zmResult.id}.`);

        await zoneMemberships.delete({ id: key });
        u.send(`${objResult.data?.name ?? objResult.id}(#${objResult.id}) removed from zone #${zmResult.id}.`);
        return;
      }

      // ── /purge ─────────────────────────────────────────────────────────
      if (sw === "purge") {
        // Remove object from all zones (as member) AND remove all its members (as ZM)
        const asMember = await zoneMemberships.find({ memberId: objResult.id });
        const asZM     = await zoneMemberships.find({ zmId: objResult.id });
        const all      = [...asMember, ...asZM];
        for (const entry of all) await zoneMemberships.delete({ id: entry.id });
        u.send(`Purged ${all.length} zone entr${all.length === 1 ? "y" : "ies"} for #${objResult.id}.`);
        return;
      }

      // ── /replace ───────────────────────────────────────────────────────
      if (sw === "replace") {
        if (!zmRef || !zmRef.includes("/")) return u.send("Usage: @zone/replace <object>=<oldZM>/<newZM>");
        const [oldRef, newRef] = zmRef.split("/");
        const oldZM = await target(en as unknown as IDBOBJ, oldRef.trim());
        const newZM = await target(en as unknown as IDBOBJ, newRef.trim());
        if (!oldZM) return send([u.socketId ?? ""], `I can't find old zone master '${oldRef}'.`);
        if (!newZM) return send([u.socketId ?? ""], `I can't find new zone master '${newRef}'.`);

        const oldKey = `${oldZM.id}:${objResult.id}`;
        const existing = await zoneMemberships.findOne({ id: oldKey });
        if (!existing) return u.send(`${objResult.data?.name ?? objResult.id} is not in zone #${oldZM.id}.`);

        const newKey = `${newZM.id}:${objResult.id}`;
        await zoneMemberships.delete({ id: oldKey });
        await zoneMemberships.create({ id: newKey, zmId: newZM.id, memberId: objResult.id });
        u.send(`Replaced zone #${oldZM.id} with #${newZM.id} on #${objResult.id}.`);
        return;
      }

      u.send(`Unknown @zone switch: /${sw}. See 'help @zone'.`);
    },
  });
