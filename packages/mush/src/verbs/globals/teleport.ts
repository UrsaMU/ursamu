/**
 * Staff teleport set: +summon, +rsummon, +join, +rjoin.
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../../commands/types.ts";

async function resolvePlayer(
  u: IUrsamuSDK,
  ref: string,
): Promise<IDBObj | null> {
  if (!ref) return null;
  const t = await u.util.target(u.me, ref, true);
  return t ?? null;
}

export async function execSummon(u: IUrsamuSDK): Promise<void> {
  const ref = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const target = await resolvePlayer(u, ref);
  if (!target) {
    u.send(`No one found matching '${ref}'.`);
    return;
  }
  if (!target.flags.has("player")) {
    u.send("You can only summon players.");
    return;
  }

  const origin = target.location;
  if (!origin) {
    u.send("Target has no current location to remember.");
    return;
  }
  if (origin === u.here?.id) {
    u.send(`${target.name} is already here.`);
    return;
  }

  await u.db.modify(target.id, "$set", {
    "data.summon_origin": origin,
  });
  await Promise.resolve(u.teleport(target.id, u.here!.id));
  u.send(`Summoned ${target.name}.`);
}

export async function execRSummon(u: IUrsamuSDK): Promise<void> {
  const ref = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const target = await resolvePlayer(u, ref);
  if (!target) {
    u.send(`No one found matching '${ref}'.`);
    return;
  }

  const origin = target.state?.summon_origin as string | undefined;
  if (!origin) {
    u.send(`${target.name} has no summon origin recorded.`);
    return;
  }

  await u.db.modify(target.id, "$unset", {
    "data.summon_origin": 1,
  });
  await Promise.resolve(u.teleport(target.id, origin));
  u.send(`Returned ${target.name} to their previous location.`);
}

export async function execJoin(u: IUrsamuSDK): Promise<void> {
  const ref = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const target = await resolvePlayer(u, ref);
  if (!target) {
    u.send(`No one found matching '${ref}'.`);
    return;
  }
  if (!target.flags.has("player")) {
    u.send("You can only join players.");
    return;
  }

  const dest = target.location;
  if (!dest) {
    u.send("Target has no current location.");
    return;
  }
  if (dest === u.here?.id) {
    u.send(`You're already with ${target.name}.`);
    return;
  }

  const origin = u.here?.id;
  if (origin) {
    await u.db.modify(u.me.id, "$set", {
      "data.join_origin": origin,
    });
  }
  await Promise.resolve(u.teleport(u.me.id, dest));
  u.send(`Joined ${target.name}.`);
}

export async function execRJoin(u: IUrsamuSDK): Promise<void> {
  const origin = u.me.state?.join_origin as string | undefined;
  if (!origin) {
    u.send("You have no join origin recorded.");
    return;
  }

  await u.db.modify(u.me.id, "$unset", {
    "data.join_origin": 1,
  });
  await Promise.resolve(u.teleport(u.me.id, origin));
  u.send("Returned to your previous location.");
}

addCmd({
  name: "+summon",
  pattern: /^\+summon\s+(.*)/i,
  lock: "connected admin+",
  category: "Staff",
  help: `+summon <player>  — Teleport a player here.

Remembers origin for +rsummon.

Examples:
  +summon Alice`,
  exec: execSummon,
});

addCmd({
  name: "+rsummon",
  pattern: /^\+rsummon\s+(.*)/i,
  lock: "connected admin+",
  category: "Staff",
  help: `+rsummon <player>  — Return a summoned player.

Examples:
  +rsummon Alice`,
  exec: execRSummon,
});

addCmd({
  name: "+join",
  pattern: /^\+join\s+(.*)/i,
  lock: "connected admin+",
  category: "Staff",
  help: `+join <player>  — Teleport yourself to a player.

Remembers origin for +rjoin.

Examples:
  +join Alice`,
  exec: execJoin,
});

addCmd({
  name: "+rjoin",
  pattern: /^\+rjoin$/i,
  lock: "connected admin+",
  category: "Staff",
  help: `+rjoin  — Return to where you were before +join.

Examples:
  +rjoin`,
  exec: execRJoin,
});
