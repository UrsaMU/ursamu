import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK, IDBObj } from "../@types/UrsamuSDK.ts";

export async function execLook(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();

  if (actor.flags.has("blind")) {
    u.send("You can't see anything!");
    return;
  }

  let target = u.here as IDBObj;
  if (arg) {
    const results = await u.db.search(arg);
    const found = results.find((r) =>
      r.id === u.here.id ||
      (u.here as unknown as { contents?: IDBObj[] }).contents?.some((c) => c.id === r.id) ||
      actor.contents?.some((c) => (c as IDBObj).id === r.id)
    );
    if (!found) { u.send("I can't find that here."); return; }
    target = found;
  }

  const canEditTarget = await u.canEdit(actor, target);
  const isOpaque = target.flags.has("opaque");
  const showContents = !isOpaque || canEditTarget;

  const rawDesc = (target.state.description as string) || "You see nothing special.";
  const description = u.util.parseDesc
    ? await (u.util.parseDesc as (d: string, a: IDBObj, t: IDBObj) => Promise<string>)(rawDesc, actor, target)
    : rawDesc;

  const contents = (target as unknown as { contents?: IDBObj[] }).contents || [];
  const characters = contents.filter((obj) =>
    obj.flags.has("player") && obj.flags.has("connected") && obj.id !== actor.id
  );
  const objects = contents.filter((obj) =>
    !obj.flags.has("player") && !obj.flags.has("exit") && !obj.flags.has("room")
  );
  const exits = contents.filter((obj) => obj.flags.has("exit"));

  const nameStr = canEditTarget
    ? `${u.util.displayName(target, actor)}(#${target.id})`
    : u.util.displayName(target, actor);
  let out = `%ch${nameStr}%cn\n${description}\n`;

  if (showContents) {
    if (characters.length > 0) {
      out += "\n%chCharacters:%cn\n";
      for (const c of characters) out += `  ${u.util.displayName(c, actor)}\n`;
    }
    if (objects.length > 0) {
      out += "\n%chContents:%cn\n";
      for (const o of objects) out += `  ${u.util.displayName(o, actor)}\n`;
    }
  }

  if (exits.length > 0) {
    out += "\n%chExits:%cn\n";
    const exitNames = exits.map((e) => ((e.state.name as string) || e.name || "").split(";")[0]);
    out += `  ${exitNames.join("  ")}\n`;
  }

  u.send(out);

  // Fire @odesc when looking at non-room objects
  if (!target.flags.has("room")) {
    const odesc = await u.attr.get(target.id, "ODESC");
    if (odesc) {
      const actorName = u.util.displayName(actor, actor);
      u.here.broadcast(`${actorName} ${odesc}`, { exclude: [actor.id] } as Record<string, unknown>);
    }
  }
}

export default () => {
  addCmd({
    name: "look",
    pattern: /^(?:look|l)(?:\s+(.*))?$/i,
    lock: "connected",
    category: "Navigation",
    help: `look [<object>]  — Look at your surroundings, or examine a specific object.

Without an argument, looks at the room you are in.
Aliases: l

Examples:
  look
  look sword
  look Alice`,
    exec: execLook,
  });
};
