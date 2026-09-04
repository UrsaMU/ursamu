/**
 * Native say/pose overrides. Disk system/scripts overrides are not
 * dispatched by the current engine pipeline (native addCmd wins), so
 * this plugin replaces stock say/pose cmds at init.
 */
import { addCmd, cmds, gameHooks } from "@ursamu/mush";
import type { ICmd, IUrsamuSDK } from "@ursamu/mush";
import { garble } from "./garble.ts";
import {
  connectedListeners,
  langDefFor,
  maybeLearn,
  readActive,
  realityOf,
  renderQuoted,
  skillIn,
  speakerName,
} from "./speech-helpers.ts";

let _stockSay: ICmd | undefined;
let _stockPose: ICmd | undefined;
let _installed = false;

function removeCmdByName(name: string): void {
  for (let i = cmds.length - 1; i >= 0; i--) {
    if (cmds[i].name === name) cmds.splice(i, 1);
  }
}

export async function execLangSay(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.args[0] ?? "").toString();
  const msg = u.util.stripSubs(raw).trim();
  if (!msg) {
    u.send("Say what?");
    return;
  }

  const name = speakerName(u);
  const active = await readActive(u.me);
  const reality = realityOf(u);

  if (!active) {
    u.here.broadcast(
      `%ch${name}%cn says, "${msg}"`,
      { reality },
    );
    await gameHooks.emit("player:say", {
      actorId: u.me.id,
      actorName: name,
      roomId: u.here.id,
      message: msg,
      socketId: u.socketId,
    });
    return;
  }

  const def = langDefFor(active);
  u.send(`You say in ${active}, "${msg}"`);
  for (const listener of connectedListeners(u)) {
    const skill = await skillIn(listener, active);
    const text = garble(msg, def, skill);
    u.send(
      `${name} says in ${active}, "${text}"`,
      listener.id,
    );
    await maybeLearn(u, listener, active, skill);
  }
  await gameHooks.emit("player:say", {
    actorId: u.me.id,
    actorName: name,
    roomId: u.here.id,
    message: msg,
    socketId: u.socketId,
    language: active,
  });
}

export async function execLangPose(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.args[0] ?? "").toString();
  const msg = u.util.stripSubs(raw);
  if (!msg.trim()) {
    u.send("Pose what?");
    return;
  }

  const isSemi =
    u.cmd.name === ";" ||
    (u.cmd.original ?? "").trimStart().startsWith(";");
  const join = isSemi ? "" : " ";
  const name = speakerName(u);
  const active = await readActive(u.me);
  const body = msg.trim();
  const reality = realityOf(u);

  if (!active || !body.includes('"')) {
    const line = `${name}${join}${body}`;
    u.here.broadcast(`%ch${line}%cn`, { reality });
    await gameHooks.emit("player:pose", {
      actorId: u.me.id,
      actorName: name,
      roomId: u.here.id,
      content: line,
      isSemipose: isSemi,
      socketId: u.socketId,
    });
    return;
  }

  const def = langDefFor(active);
  u.send(`${name}${join}${body}`);
  for (const listener of connectedListeners(u)) {
    const skill = await skillIn(listener, active);
    const rendered = renderQuoted(body, def, skill);
    u.send(`${name}${join}${rendered}`, listener.id);
    await maybeLearn(u, listener, active, skill);
  }
  await gameHooks.emit("player:pose", {
    actorId: u.me.id,
    actorName: name,
    roomId: u.here.id,
    content: `${name}${join}${body}`,
    isSemipose: isSemi,
    socketId: u.socketId,
    language: active,
  });
}

const sayCmd: ICmd = {
  name: "say",
  pattern: /^(?:say\s+|["'])(.*)/is,
  lock: "connected",
  category: "Communication",
  help: `say <message>  — Say something to everyone in the room.

Aliases: " <message>, ' <message>

When you have an active language (+speak / +language/speak),
listeners hear garbled text based on their skill.

Examples:
  say Hello everyone!
  "Hello everyone!`,
  exec: execLangSay,
};

const poseCmd: ICmd = {
  name: "pose",
  pattern: /^(?:pose\s+|[:;])(.*)/is,
  lock: "connected",
  category: "Communication",
  help: `pose <action>  — Pose an action to the room.

Aliases: : <action>, ; <action> (semipose)

Quoted speech inside a pose is garbled when you have an
active language; action text outside quotes stays clear.

Examples:
  pose waves to everyone.
  :says "Hello" and bows.`,
  exec: execLangPose,
};

/** Replace stock say/pose with language-aware handlers. */
export function installSpeechCmds(): void {
  if (_installed) return;
  _stockSay = cmds.find((c) => c.name === "say");
  _stockPose = cmds.find((c) => c.name === "pose");
  removeCmdByName("say");
  removeCmdByName("pose");
  addCmd(sayCmd, poseCmd);
  _installed = true;
}

/** Restore stock say/pose if this plugin installed overrides. */
export function restoreSpeechCmds(): void {
  if (!_installed) return;
  removeCmdByName("say");
  removeCmdByName("pose");
  if (_stockSay) addCmd(_stockSay);
  if (_stockPose) addCmd(_stockPose);
  _stockSay = undefined;
  _stockPose = undefined;
  _installed = false;
}
