import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @zone[/<switch>] [<args>]
 *
 * Manage Zone Master Objects (ZMOs). A zone is a named game object that rooms
 * can be linked to, enabling grouped building operations.
 *
 * Switches:
 *   /create <name>            Create a new Zone Master Object.
 *   /destroy <name>           Destroy a ZMO and unlink all its rooms.
 *   /add [<room>=]<zone>      Link a room to a zone (defaults to current room).
 *   /remove [<room>=]<zone>   Unlink a room from a zone.
 *   /list [<zone>]            List all zones, or all rooms belonging to a zone.
 *   /info <zone>              Show zone details and room count.
 *
 * Examples:
 *   @zone/create Market District     Create a zone called "Market District".
 *   @zone/add here=Market District   Add current room to the Market District zone.
 *   @zone/add #12=Market District    Add room #12 to the zone.
 *   @zone/list                       Show all zones.
 *   @zone/list Market District       Show all rooms in Market District.
 *   @zone/info Market District       Show zone details.
 *   @zone/remove here=Market District   Remove current room from zone.
 *   @zone/destroy Market District    Destroy the ZMO and unlink all rooms.
 */
export default async (u: IUrsamuSDK) => {
  const sw  = (u.cmd.switches?.[0] ?? "").toLowerCase().trim();
  const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();

  const isBuilder = u.me.flags.has("builder") || u.me.flags.has("admin") ||
                    u.me.flags.has("wizard")   || u.me.flags.has("superuser");
  if (!isBuilder) { u.send("Permission denied."); return; }

  if (!sw || sw === "list") return handleList(u, arg);
  if (sw === "create")      return handleCreate(u, arg);
  if (sw === "destroy")     return handleDestroy(u, arg);
  if (sw === "add")         return handleAdd(u, arg);
  if (sw === "remove")      return handleRemove(u, arg);
  if (sw === "info")        return handleInfo(u, arg);

  u.send(`Unknown switch "/${sw}". See %ch@zone%cn for usage.`);
};

// ─── helpers ──────────────────────────────────────────────────────────────────

async function findZmo(u: IUrsamuSDK, name: string) {
  const clean = name.trim();
  if (!clean) return null;
  const results = await u.db.search({ flags: /zone/i });
  return results.find(z => {
    const zName = (z.state.name as string ?? "").toLowerCase();
    return z.id === clean.replace(/^#/, "") || zName === clean.toLowerCase();
  }) ?? null;
}

function parseRoomAndZone(arg: string): { roomRef: string; zoneName: string } {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) return { roomRef: "here", zoneName: arg };
  return {
    roomRef:  arg.slice(0, eqIdx).trim() || "here",
    zoneName: arg.slice(eqIdx + 1).trim(),
  };
}

// ─── /create ──────────────────────────────────────────────────────────────────

async function handleCreate(u: IUrsamuSDK, name: string) {
  if (!name) { u.send("Usage: @zone/create <name>"); return; }
  // Strip newlines — a zone name containing \n would inject commands if the
  // name is ever written into a build script via @batchbuild/save.
  const safeName = name.replace(/[\r\n]/g, " ").trim();
  if (!safeName) { u.send("Usage: @zone/create <name>"); return; }
  if (safeName.length > 200) { u.send("Zone name too long (max 200 characters)."); return; }

  const existing = await findZmo(u, safeName);
  if (existing) {
    u.send(`A zone named %ch${safeName}%cn already exists (#${existing.id}).`);
    return;
  }

  const zmo = await u.db.create({
    flags: new Set(["thing", "zone"]),
    location: u.me.id,
    state: { name: safeName, owner: u.me.id, description: "" },
  });

  u.send(`Zone %ch${safeName}%cn created (#${zmo.id}).`);
}

// ─── /destroy ─────────────────────────────────────────────────────────────────

async function handleDestroy(u: IUrsamuSDK, name: string) {
  if (!name) { u.send("Usage: @zone/destroy <name>"); return; }

  const zmo = await findZmo(u, name);
  if (!zmo) { u.send(`No zone found matching "${name}".`); return; }
  if (!(await u.canEdit(u.me, zmo))) { u.send("Permission denied."); return; }

  // Unlink all rooms belonging to this zone
  const linked = await u.db.search({ "data.zone": zmo.id });
  for (const room of linked) {
    await u.db.modify(room.id, "$unset", { "data.zone": "" });
  }

  await u.db.destroy(zmo.id);
  u.send(
    `Zone %ch${zmo.state.name as string}%cn (#${zmo.id}) destroyed.` +
    (linked.length > 0 ? ` ${linked.length} room${linked.length === 1 ? "" : "s"} unlinked.` : "")
  );
}

// ─── /add ─────────────────────────────────────────────────────────────────────

async function handleAdd(u: IUrsamuSDK, arg: string) {
  if (!arg) { u.send("Usage: @zone/add [<room>=]<zone>"); return; }

  const { roomRef, zoneName } = parseRoomAndZone(arg);
  if (!zoneName) { u.send("Usage: @zone/add [<room>=]<zone>"); return; }

  const room = await resolveRoom(u, roomRef);
  if (!room) return;

  if (!(await u.canEdit(u.me, room))) { u.send("Permission denied."); return; }
  if (!room.flags.has("room")) { u.send("Target must be a room."); return; }

  const zmo = await findZmo(u, zoneName);
  if (!zmo) { u.send(`No zone found matching "${zoneName}".`); return; }

  await u.db.modify(room.id, "$set", { "data.zone": zmo.id });
  u.send(
    `Room %ch${u.util.displayName(room, u.me)}%cn (#${room.id}) added to zone %ch${zmo.state.name as string}%cn.`
  );
}

// ─── /remove ──────────────────────────────────────────────────────────────────

async function handleRemove(u: IUrsamuSDK, arg: string) {
  if (!arg) { u.send("Usage: @zone/remove [<room>=]<zone>"); return; }

  const { roomRef } = parseRoomAndZone(arg);

  const room = await resolveRoom(u, roomRef);
  if (!room) return;

  if (!(await u.canEdit(u.me, room))) { u.send("Permission denied."); return; }
  if (!room.flags.has("room")) { u.send("Target must be a room."); return; }

  const currentZoneId = room.state.zone as string | undefined;
  if (!currentZoneId) {
    u.send(`%ch${u.util.displayName(room, u.me)}%cn is not in any zone.`);
    return;
  }

  await u.db.modify(room.id, "$unset", { "data.zone": "" });
  u.send(`Room %ch${u.util.displayName(room, u.me)}%cn (#${room.id}) removed from its zone.`);
}

// ─── /list ────────────────────────────────────────────────────────────────────

async function handleList(u: IUrsamuSDK, arg: string) {
  if (!arg) {
    const zones = await u.db.search({ flags: /zone/i });
    if (zones.length === 0) { u.send("No zones defined."); return; }

    const lines: string[] = [u.util.center("%ch=== Zones ===%cn", 78, "=")];
    for (const z of zones) {
      const rooms  = await u.db.search({ "data.zone": z.id });
      const zName  = u.util.displayName(z, u.me);
      lines.push(
        u.util.ljust(`%ch${zName}%cn (#${z.id})`, 50) +
        u.util.rjust(`${rooms.length} room${rooms.length === 1 ? "" : "s"}`, 10)
      );
    }
    lines.push("=".repeat(78));
    u.send(lines.join("\r\n"));
    return;
  }

  const zmo = await findZmo(u, arg);
  if (!zmo) { u.send(`No zone found matching "${arg}".`); return; }

  const rooms = await u.db.search({ "data.zone": zmo.id });
  if (rooms.length === 0) {
    u.send(`Zone %ch${zmo.state.name as string}%cn has no rooms.`);
    return;
  }

  const lines: string[] = [
    u.util.center(`%ch=== ${zmo.state.name as string} ===%cn`, 78, "="),
  ];
  for (const room of rooms) {
    lines.push(`  ${u.util.displayName(room, u.me)} (#${room.id})`);
  }
  lines.push("=".repeat(78));
  u.send(lines.join("\r\n"));
}

// ─── /info ────────────────────────────────────────────────────────────────────

async function handleInfo(u: IUrsamuSDK, name: string) {
  if (!name) { u.send("Usage: @zone/info <zone>"); return; }

  const zmo = await findZmo(u, name);
  if (!zmo) { u.send(`No zone found matching "${name}".`); return; }

  const rooms = await u.db.search({ "data.zone": zmo.id });
  const owner = (await u.db.search({ id: zmo.state.owner as string }))[0];
  const desc  = (zmo.state.description as string) || "(no description)";

  const lines: string[] = [
    u.util.center(`%ch=== Zone: ${zmo.state.name as string} ===%cn`, 78, "="),
    `  %chID:%cn       #${zmo.id}`,
    `  %chOwner:%cn    ${owner ? u.util.displayName(owner, u.me) : "unknown"} (#${zmo.state.owner as string})`,
    `  %chRooms:%cn    ${rooms.length}`,
    `  %chDesc:%cn     ${desc}`,
    "=".repeat(78),
  ];
  u.send(lines.join("\r\n"));
}

// ─── shared ───────────────────────────────────────────────────────────────────

async function resolveRoom(u: IUrsamuSDK, ref: string) {
  if (ref === "here") return u.here;
  const results = await u.db.search(ref);
  const room    = results[0] ?? null;
  if (!room) { u.send(`I can't find "${ref}".`); return null; }
  return room;
}
