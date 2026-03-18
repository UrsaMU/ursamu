import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: create.ts
 * Pre-auth: character creation (`create <name> <password>`)
 * Post-auth: object builder (`@create <name>[=<cost>]`)
 */
export default async (u: IUrsamuSDK) => {
  // Pre-auth path: player character creation
  if (u.me.id === "#-1") {
    const input = (u.cmd.args[0] || "").trim();
    const pieces = input.split(/\s+/);

    if (pieces.length < 2) {
      u.send("Usage: create <name> <password>");
      return;
    }

    const password = pieces.pop()!;
    const name = pieces.join(" ").trim();

    if (!name || !password) {
      u.send("You must provide both a name and password.");
      return;
    }

    // Check name availability
    const existing = await u.db.search({
      $or: [
        { "data.name": new RegExp(`^${name}$`, "i") },
        { "data.alias": new RegExp(`^${name}$`, "i") },
      ],
    });
    if (existing.length > 0) {
      u.send("That name is already taken or unavailable.");
      return;
    }

    // First player becomes superuser
    const superusers = await u.db.search({ flags: /superuser/ });
    const flagStr = superusers.length > 0
      ? "player connected"
      : "player connected superuser";

    const startRooms = await u.db.search({ id: "1" });
    if (!startRooms.length) {
      u.send("Error: Starting room not found!");
      return;
    }

    const hashedPassword = await u.auth.hash(password);

    const player = await u.db.create({
      flags: new Set(flagStr.split(" ")),
      location: startRooms[0].id,
      state: {
        name,
        home: startRooms[0].id,
        password: hashedPassword,
        money: 100,
        quota: 20,
      },
    });

    await u.auth.login(player.id);
    u.send(`Welcome to the game, ${name}!`);
    u.execute("look");
    return;
  }

  // Post-auth path: object builder
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();

  if (!input) {
    u.send("Usage: @create <name>[=<cost>]");
    return;
  }

  const [name, costStr] = input.split("=");
  const objName = name.trim();
  const objCost = costStr ? parseInt(costStr.trim()) : 0;

  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") ||
    actor.flags.has("superuser");
  const quota = (actor.state.quota as number) || 0;
  const cost = 1;

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  const thing = await u.db.create({
    flags: new Set(["thing"]),
    location: actor.id,
    state: {
      name: objName,
      owner: actor.id,
      value: objCost,
    },
  });

  if (!isStaff) {
    actor.state.quota = quota - cost;
    await u.db.modify(actor.id, "$set", { data: { ...actor.state } });
  }

  u.send(`You create ${objName} (#${thing.id}).`);
};
