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

export function defaultOocLine(body: string): string {
  return `${DEFAULT_OOC_PREFIX}${body}`;
}

function displayName(u: IUrsamuSDK): string {
  const a = u.me;
  return String(
    (a.state?.moniker as string | undefined) ||
      (a.state?.name as string | undefined) ||
      a.name ||
      "Someone",
  );
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
  const fallback = defaultOocLine(body);

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
  u.here.broadcast(line, { reality });

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
  help: `ooc <text>     - Speak OOC to the room.
ooc :<pose>    - OOC pose.
ooc ;<semi>    - OOC semipose (no space after name).

Default format: %cr<OOC>%cn <body>
Customize with softcode on yourself:
  &OOCFORMAT me=%ch%cr((OOC))%cn %0
%0 is the body (name + say/pose text).

Examples:
  ooc brb five minutes
  ooc :waves
  ooc ;'s phone buzzes.`,
  exec: execOoc,
});
