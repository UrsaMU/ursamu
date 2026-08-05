/**
 * ooc - room-wide out-of-character speech / pose.
 *
 *   ooc hello        →  %cr<OOC>%cn Name says, "hello"
 *   ooc :waves       →  %cr<OOC>%cn Name waves
 *   ooc ;'s phone    →  %cr<OOC>%cn Name's phone
 *
 * Players may set &OOCFORMAT me=<mushcode> where %0 is the body
 * (name + say/pose text). Empty / missing attr → default prefix.
 */

import { gameHooks } from "@ursamu/core";
import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { resolveFormatOr } from "../format/handlers.ts";
import { resolveAvatarUrl } from "../routes/avatar-url.ts";
import { isWebChatEnabled } from "./globals/chat.ts";

export const DEFAULT_OOC_PREFIX = "%cr<OOC>%cn ";

export type OocMode = "say" | "pose" | "semi";

/** Parse leading : / ; after eval (pose / semipose). */
export function parseOocInput(raw: string): {
  mode: OocMode;
  text: string;
} {
  const s = raw.trimStart();
  if (s.startsWith(":")) {
    return { mode: "pose", text: s.slice(1).trimStart() };
  }
  if (s.startsWith(";")) {
    return { mode: "semi", text: s.slice(1) };
  }
  return { mode: "say", text: s.trim() };
}

/** Build the body passed as %0 to OOCFORMAT. */
export function buildOocBody(
  name: string,
  mode: OocMode,
  text: string,
): string {
  if (mode === "semi") return `${name}${text}`;
  if (mode === "pose") return `${name} ${text}`;
  return `${name} says, "${text}"`;
}

export function defaultOocLine(
  body: string,
  prefix = DEFAULT_OOC_PREFIX,
): string {
  return `${prefix}${body}`;
}

/** Personal +ooctag override, else default %cr<OOC>%cn. */
export function oocPrefixOf(me: {
  state?: Record<string, unknown>;
}): string {
  const tag = me.state?.ooctag;
  if (typeof tag === "string" && tag.trim()) {
    return tag.endsWith(" ") ? tag : `${tag} `;
  }
  return DEFAULT_OOC_PREFIX;
}

function displayName(u: IUrsamuSDK): string {
  const a = u.me;
  if (u.util?.displayName) {
    return u.util.displayName(a, a);
  }
  return String(
    (a.state?.moniker as string | undefined) ||
      (a.state?.name as string | undefined) ||
      a.name ||
      "Someone",
  );
}

/** Web play chat bubble for OOC (telnet still gets plain line). */
async function oocChatPayload(
  u: IUrsamuSDK,
  mode: OocMode,
  text: string,
  name: string,
): Promise<Record<string, unknown> | null> {
  const actor = u.me;
  const bag = (actor.state ?? {}) as Record<string, unknown>;
  if (!isWebChatEnabled(bag)) return null;
  const avatar = await resolveAvatarUrl(actor.id, bag);
  return {
    ui: {
      type: "chat",
      kind: "ooc",
      oocMode: mode,
      actorId: actor.id,
      name,
      avatar: avatar || null,
      text,
      tag: "OOC",
      at: Date.now(),
    },
  };
}

export async function execOoc(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) {
    u.send("OOC what?");
    return;
  }

  const evaluated = await u.evalString(raw);
  const { mode, text } = parseOocInput(evaluated);
  if (!text && mode === "say") {
    u.send("OOC what?");
    return;
  }

  const name = displayName(u);
  const body = buildOocBody(name, mode, text);
  const fallback = defaultOocLine(body, oocPrefixOf(u.me));

  let line = fallback;
  try {
    line = await resolveFormatOr(
      u,
      u.me,
      "OOCFORMAT",
      body,
      fallback,
    );
  } catch {
    line = fallback;
  }
  if (!line.trim()) line = fallback;

  const reality =
    (u.me.state?.reality as string | undefined) ?? "material";
  const data = await oocChatPayload(u, mode, text, name);
  u.here.broadcast(
    line,
    data ? { reality, data } : { reality },
  );

  try {
    await gameHooks.emit("player:ooc", {
      actorId: u.me.id,
      actorName: name,
      roomId: u.here.id,
      body,
      line,
      mode,
      socketId: u.socketId,
    });
  } catch {
    /* optional */
  }
}

addCmd({
  name: "ooc",
  pattern: /^ooc\s+(.*)/is,
  lock: "connected",
  category: "Communication",
  // Chat bubble is the echo on web
  echo: false,
  help: `ooc <text>     - Speak OOC to the room.
ooc :<pose>    - OOC pose.
ooc ;<semi>    - OOC semipose (no space after name).

Default format: %cr<OOC>%cn <body>
Customize with softcode on yourself:
  &OOCFORMAT me=%ch%cr((OOC))%cn %0
%0 is the body (name + say/pose text).

On web play, OOC uses chat bubbles (see +chat) with an
OOC badge. Telnet keeps the classic prefix line.

Examples:
  ooc brb five minutes
  ooc :waves
  ooc ;'s phone buzzes.
See also: +ooctag, +chat`,
  exec: execOoc,
});

export async function execOocTag(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.args[0] ?? "").trim();

  if (!raw) {
    const override = u.me.state?.ooctag as string | undefined;
    const effective = oocPrefixOf(u.me).trimEnd();
    const source =
      override && String(override).trim()
        ? "personal"
        : "default";
    u.send(`OOC tag (${source}): ${effective}`);
    return;
  }

  const lower = raw.toLowerCase();
  if (lower === "reset" || lower === "clear") {
    await u.db.modify(u.me.id, "$unset", { "data.ooctag": 1 });
    u.send(
      `OOC tag cleared. Now using: ${DEFAULT_OOC_PREFIX.trim()}`,
    );
    return;
  }

  await u.db.modify(u.me.id, "$set", { "data.ooctag": raw });
  u.send(`OOC tag set. Preview: ${raw}`);
}

addCmd({
  name: "+ooctag",
  pattern: /^\+ooctag(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Communication",
  help: `+ooctag [<literal>]  — Set or view your OOC tag.

Literal includes decoration and MUSH color codes.
Bare +ooctag shows the effective tag. reset/clear
restores the default %cr<OOC>%cn prefix.

Examples:
  +ooctag
  +ooctag [%cyOOC%cn]
  +ooctag reset`,
  exec: execOocTag,
});
