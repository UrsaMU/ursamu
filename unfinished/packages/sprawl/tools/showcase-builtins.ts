/**
 * Engine builtins used by showcases (use, inv, look).
 * Registered via shim addCmd so JSON can say: "cmd": "use yeheyuan"
 */
import { addCmd, gameHooks } from "@ursamu/mush";
import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";
import { isHiddenInVehicle } from "../integrations/look.ts";
import { itemData } from "../engine/items.ts";
import { isVehicle, vehicleLabel } from "../engine/vehicles.ts";

addCmd({
  name: "use",
  pattern: /^use\s+(.*)/i,
  lock: "connected",
  category: "Object",
  help: "use <object>",
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    if (!arg) {
      u.send("Use what?");
      return;
    }
    const thing = await u.util.target(u.me, arg) as IDBObj | null;
    if (!thing) {
      u.send("I don't see that here.");
      return;
    }
    const hereId = u.me.location;
    if (
      thing.location !== hereId &&
      thing.location !== u.me.id
    ) {
      u.send("I don't see that here.");
      return;
    }
    const bag = {
      u,
      actor: u.me,
      thing,
      verb: "use",
      handled: false as boolean,
    };
    try {
      // deno-lint-ignore no-explicit-any
      await (gameHooks as any).emit?.("object:use", bag);
    } catch {
      /* optional */
    }
    if (bag.handled) return;
    const name = u.util.displayName(thing, u.me);
    u.send(`You use ${name}.`);
  },
});

addCmd({
  name: "inventory",
  pattern: /^(?:inventory|inv|i)$/i,
  lock: "connected",
  category: "Information",
  help: "inventory",
  exec: async (u: IUrsamuSDK) => {
    const ctx = { u, handled: false };
    try {
      // deno-lint-ignore no-explicit-any
      await (gameHooks as any).emit?.("inventory:show", ctx);
    } catch {
      /* optional */
    }
    if (ctx.handled) return;
    u.send("You are not carrying anything.");
  },
});

/** @desc <target>=<text> — same field look uses as base body. */
addCmd({
  name: "@desc",
  pattern: /^@?desc(?:ribe)?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: "@desc <target>=<description>",
  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const eq = raw.indexOf("=");
    if (eq < 0) {
      u.send("Usage: @desc <target>=<description>");
      return;
    }
    const targetStr = raw.slice(0, eq).trim();
    const value = (u.cmd.args[0] ?? "").slice(eq + 1);
    const tar = targetStr.toLowerCase() === "me"
      ? u.me
      : await u.util.target(u.me, targetStr);
    if (!tar) {
      u.send("I can't find that.");
      return;
    }
    if (!(await u.canEdit(u.me, tar))) {
      u.send("Permission denied.");
      return;
    }
    await u.db.modify(tar.id, "$set", {
      "data.description": value,
    });
    // Keep live object in sync for same-tick looks
    tar.state = { ...tar.state, description: value };
    u.send(
      `DESCRIPTION set on ${u.util.displayName(tar, u.me)}.`,
    );
  },
});

/**
 * look [here] — room roster for showcases.
 * Boarded PCs hidden; vehicles (on people or in room) shown.
 */
addCmd({
  name: "look",
  pattern: /^look(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Information",
  help: "look [here|target]",
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    const here = u.here as IDBObj;
    if (!arg || arg === "here" || arg === "room") {
      await renderRoomLook(u, here);
      return;
    }
    if (arg === "me") {
      u.send(
        `${u.util.displayName(u.me, u.me)}\n` +
          String(u.me.state?.description ?? "You see nothing special."),
      );
      return;
    }
    const t = await u.util.target(u.me, arg) as IDBObj | null;
    if (!t) {
      u.send("I don't see that here.");
      return;
    }
    u.send(
      `${u.util.displayName(t, u.me)}\n` +
        String(t.state?.description ?? "You see nothing special."),
    );
  },
});

async function renderRoomLook(
  u: IUrsamuSDK,
  here: IDBObj,
): Promise<void> {
  const pool = await u.db.search({}) as IDBObj[];
  const inRoom = pool.filter(
    (o) => o.location === here.id || o.location === "mock-room",
  );
  // Players standing free (not boarded)
  const players = inRoom.filter(
    (o) =>
      o.flags.has("player") &&
      o.flags.has("connected") &&
      !isHiddenInVehicle(o),
  );
  // Things in room + vehicles carried by anyone here
  const roomThings = inRoom.filter(
    (o) =>
      !o.flags.has("player") &&
      !o.flags.has("exit") &&
      !o.flags.has("room"),
  );
  const carriedVeh: IDBObj[] = [];
  for (const p of inRoom.filter((o) => o.flags.has("player"))) {
    const bag = pool.filter((o) => o.location === p.id);
    for (const o of bag) {
      if (isVehicle(itemData(o))) carriedVeh.push(o);
    }
  }
  const seen = new Set<string>();
  const vehicles: IDBObj[] = [];
  for (const o of [...roomThings, ...carriedVeh]) {
    if (seen.has(o.id)) continue;
    if (isVehicle(itemData(o))) {
      seen.add(o.id);
      vehicles.push(o);
    }
  }
  const otherThings = roomThings.filter(
    (o) => !isVehicle(itemData(o)),
  );

  const lines = [
    `=== ${here.name ?? "Room"} ===`,
    String(
      here.state?.description ??
        "Rain-slick street. Neon in the gutters.",
    ),
    "--- Players ---",
  ];
  if (!players.length) {
    lines.push(" (none visible — boarded crew hidden)");
  } else {
    for (const p of players) {
      lines.push(` ${u.util.displayName(p, u.me)}`);
    }
  }
  lines.push("--- Contents ---");
  if (!vehicles.length && !otherThings.length) {
    lines.push(" (empty)");
  }
  for (const v of vehicles) {
    // vehicleLabel includes "N aboard" when crew seated
    lines.push(` ${vehicleLabel(v)}`);
  }
  for (const t of otherThings) {
    lines.push(` ${u.util.displayName(t, u.me)}`);
  }
  lines.push(
    "(Boarded crew hidden · vehicles still listed)",
  );
  u.send(lines.join("\r\n"));
}
