import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

const MAX_LISTEN_MSG_LEN = 2_000;
const MAX_LISTEN_PATTERN_LEN = 500;

function matchListen(pattern: string, text: string): boolean {
  const p = pattern.trim().toLowerCase();
  const t = text.toLowerCase();
  if (p === "*") return true;
  const hasLeading = p.startsWith("*");
  const hasTrailing = p.endsWith("*");
  if (hasLeading && hasTrailing) {
    const inner = p.slice(1, -1);
    return inner === "" ? true : t.includes(inner);
  }
  if (hasLeading) return t.endsWith(p.slice(1));
  if (hasTrailing) return t.startsWith(p.slice(0, -1));
  return t.includes(p);
}

export async function execSay(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("What do you want to say?"); return; }

  const message = await u.evalString(raw);
  const name = (actor.state.moniker as string) || (actor.state.name as string) || actor.name;
  u.here.broadcast(`%ch${name}%cn says, "${message}"`);

  try {
    const roomContents = await u.db.search({ location: u.here.id });
    const ahearMsg = message.length > MAX_LISTEN_MSG_LEN
      ? message.slice(0, MAX_LISTEN_MSG_LEN)
      : message;
    for (const obj of roomContents) {
      if (obj.id === actor.id) continue;
      const listenAttr = (obj.state.attributes as Array<{ name: string; value: string }> | undefined)
        ?.find((a) => a.name.toUpperCase() === "LISTEN");
      if (!listenAttr) continue;
      if (listenAttr.value.length > MAX_LISTEN_PATTERN_LEN) continue;
      if (!matchListen(listenAttr.value, message)) continue;
      await u.trigger(obj.id, "AHEAR", [ahearMsg, actor.id]);
    }
  } catch (_e: unknown) {
    console.warn("[say:listen]", _e);
  }
}

export async function execPose(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("Pose what?"); return; }

  const input = await u.evalString(raw);
  const name = (actor.state.moniker as string) || (actor.state.name as string) || actor.name;
  const isSemipose = u.cmd.original?.trimStart().startsWith(";") ?? false;
  const content = isSemipose ? `${name}${input}` : `${name} ${input}`;
  u.here.broadcast(`%ch${content}%cn`);
}

export async function execThink(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("What do you want to think?"); return; }
  const message = await u.evalString(raw);
  u.send(message);
}

export async function execPage(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^(.+?)=(.*)$/);
  if (!match) { u.send("Usage: page <target>=<message>"); return; }

  const targetName = match[1].trim();
  const rawMessage = await u.evalString(match[2].trim());
  if (!rawMessage) { u.send("What do you want to say?"); return; }

  const target = (await u.db.search(targetName)).find((obj) => obj.flags.has("player"));
  if (!target || target.flags.has("dark") || !target.flags.has("connected")) {
    u.send(`I can't find player "${targetName}" online.`);
    return;
  }

  const actorAlias = actor.state?.alias as string;
  const actorBaseName = (actor.state?.moniker as string) || (actor.state?.name as string) || actor.name || "Someone";
  const actorDisplay = actorAlias ? `${actorBaseName}(${actorAlias})` : actorBaseName;

  const targetAlias = target.state?.alias as string;
  const targetBaseName = (target.state?.moniker as string) || (target.state?.name as string) || target.name || "Someone";
  const targetDisplay = targetAlias ? `${targetBaseName}(${targetAlias})` : targetBaseName;

  const pageLock = ((target.state?.locks ?? {}) as Record<string, string>).page;
  if (pageLock) {
    const allowed = await u.checkLock(target.id, pageLock);
    if (!allowed) { u.send(`${targetDisplay} is not accepting pages.`); return; }
  }

  const away = target.state?.away as string | undefined;
  if (away) u.send(`%ch%cy[Away]%cn ${targetDisplay}: ${away}`);

  if (rawMessage.startsWith(":")) {
    const pose = rawMessage.slice(1);
    u.send(`From afar, %ch${actorDisplay}%cn ${pose}`, target.id);
    u.send(`Long distance to ${targetDisplay}: %ch${actorDisplay}%cn ${pose}`);
  } else {
    u.send(`%ch${actorDisplay}%cn pages you: ${rawMessage}`, target.id);
    u.send(`You paged ${targetDisplay} with: ${rawMessage}`);
  }
}

export async function execWhisper(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Usage: whisper <target>=<message>"); return; }

  const isPose = !arg.includes("=") && arg.includes(":");
  let targetRef: string;
  let rawMsg: string;

  if (isPose) {
    const colon = arg.indexOf(":");
    targetRef = arg.slice(0, colon).trim();
    rawMsg = await u.evalString(arg.slice(colon + 1).trim());
  } else {
    const eq = arg.indexOf("=");
    if (eq === -1) { u.send("Usage: whisper <target>=<message>"); return; }
    targetRef = arg.slice(0, eq).trim();
    rawMsg = await u.evalString(arg.slice(eq + 1).trim());
  }

  if (!rawMsg) { u.send("What do you want to whisper?"); return; }

  const roomContents = await u.db.search({ location: u.here.id });
  const target = roomContents.find((o) =>
    o.flags.has("player") &&
    o.flags.has("connected") &&
    ((o.state.name as string) || o.name || "").toLowerCase().startsWith(targetRef.toLowerCase()) &&
    o.id !== actor.id
  );
  if (!target) { u.send(`There is no connected player "${targetRef}" here.`); return; }

  const actorName = (actor.state.moniker as string) || (actor.state.name as string) || actor.name || "Someone";
  const targetName = (target.state.moniker as string) || (target.state.name as string) || target.name || "Someone";

  if (isPose) {
    u.send(`%chWhisper>%cn ${actorName} ${rawMsg}`, target.id);
    u.send(`%chWhisper>%cn ${actorName} ${rawMsg}`);
    u.here.broadcast(`%ch${actorName}%cn whispers something to %ch${targetName}%cn.`,
      { exclude: [actor.id, target.id] } as Record<string, unknown>);
  } else {
    u.send(`%ch${actorName}%cn whispers to you, "${rawMsg}"`, target.id);
    u.send(`You whisper to %ch${targetName}%cn, "${rawMsg}"`);
    u.here.broadcast(`%ch${actorName}%cn whispers something to %ch${targetName}%cn.`,
      { exclude: [actor.id, target.id] } as Record<string, unknown>);
  }
}

addCmd({
  name: "say",
  pattern: /^(?:say\s+|["'])(.*)/is,
  lock: "connected",
  category: "Communication",
  help: `say <message>  — Say something to everyone in the room.

Aliases: " <message>, ' <message>

Examples:
  say Hello everyone!
  "Hello everyone!`,
  exec: execSay,
});

addCmd({
  name: "pose",
  pattern: /^(?:pose\s+|[:;])(.*)/is,
  lock: "connected",
  category: "Communication",
  help: `pose <action>  — Pose an action to the room.

Aliases: : <action>, ; <action> (semipose — no space between name and action)

Examples:
  pose waves to everyone.
  :waves to everyone.
  ;'s eyes gleam.`,
  exec: execPose,
});

addCmd({
  name: "think",
  pattern: /^think\s+(.*)/is,
  lock: "connected",
  category: "Communication",
  help: `think <expression>  — Evaluate an expression and show the result only to you.

Useful for testing softcode without broadcasting to the room.

Examples:
  think [add(2,3)]
  think [name(me)]`,
  exec: execThink,
});

addCmd({
  name: "page",
  pattern: /^(?:page|p)\s+(.*)/i,
  lock: "connected",
  category: "Communication",
  help: `page <target>=<message>  — Send a private message to any online player.
page <target>=:<pose>    — Send a pose-style private message.

Aliases: p <target>=<message>

Examples:
  page Alice=Are you busy?
  page Bob=:waves hello.`,
  exec: execPage,
});

addCmd({
  name: "whisper",
  pattern: /^(?:whisper|wh)\s+(.*)/i,
  lock: "connected",
  category: "Communication",
  help: `whisper <target>=<message>  — Whisper privately to a player in the same room.
whisper <target>:<pose>    — Whisper-pose to a player in the same room.

Aliases: wh

Examples:
  whisper Alice=Meet me later.
  whisper Bob:leans over and whispers.`,
  exec: execWhisper,
});
