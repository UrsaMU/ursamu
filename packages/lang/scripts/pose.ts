import type { IDBObj, IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

/**
 * sgp-language: pose.ts
 *
 * Overrides the engine's stock `pose` (and `;` semipose). Action text
 * outside double-quoted spans passes through unchanged. Spans inside
 * "..." are garbled per-listener using the speaker's active language.
 * Speaker always sees their own pose clearly.
 */

export const aliases = ["pose", ":", ";"];

/* {{GARBLE_ENGINE}} */

/* {{LANG_DEFS}} */

function _readActive(o: IDBObj): string | undefined {
  const langs = (o.state as Record<string, unknown>)?.languages as
    | Record<string, unknown>
    | undefined;
  const a = langs?.active;
  return typeof a === "string" ? a.toLowerCase() : undefined;
}

function _skillIn(o: IDBObj, name: string): number {
  const langs = (o.state as Record<string, unknown>)?.languages as
    | Record<string, unknown>
    | undefined;
  const known = langs?.known as Record<string, unknown> | undefined;
  const v = known?.[name.toLowerCase()];
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.floor(v)));
}

function _renderQuoted(text: string, def: unknown, skill: number): string {
  return text.replace(/"([^"]*)"/g, (_, inner) => `"${garble(inner, def as Parameters<typeof garble>[1], skill)}"`);
}

export default async (u: IUrsamuSDK) => {
  const rawArg = (u.cmd.args[0] ?? u.cmd.original ?? "").toString();
  const msg = u.util.stripSubs(rawArg);
  if (!msg.trim()) { u.send("Pose what?"); return; }

  const isSemi = (u.cmd.name === ";" || (u.cmd.original ?? "").startsWith(";"));
  const join = isSemi ? "" : " ";
  const speakerName = u.util.displayName(u.me, u.me);
  const active = _readActive(u.me);

  if (!active || !msg.includes("\"")) {
    const line = `${speakerName}${join}${msg.trim()}`;
    u.send(line);
    u.here.broadcast(line, { except: u.me.id });
    return;
  }

  // deno-lint-ignore no-explicit-any
  const def = (LANG_DEFS as Record<string, any>)[active];
  if (!def) {
    const line = `${speakerName}${join}${msg.trim()}`;
    u.send(line);
    u.here.broadcast(line, { except: u.me.id });
    return;
  }

  u.send(`${speakerName}${join}${msg.trim()}`);
  const listeners = (u.here.contents ?? []).filter(
    (o: IDBObj) => o.flags.has("connected") && o.id !== u.me.id,
  );
  for (const listener of listeners) {
    const skill = _skillIn(listener, active);
    const rendered = _renderQuoted(msg.trim(), def, skill);
    u.send(`${speakerName}${join}${rendered}`, listener.id);
  }
};
