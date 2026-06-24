import type { IDBObj, IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

/**
 * sgp-language: say.ts
 *
 * Overrides the engine's stock `say`. When the speaker has an active
 * language (state.languages.active), the message is garbled per-listener
 * based on each listener's skill in that language. Speaker always sees
 * their own message clearly.
 */

export const aliases = ["say", "\""];

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

export default async (u: IUrsamuSDK) => {
  const rawArg = (u.cmd.args[0] ?? u.cmd.original ?? "").toString();
  const msg = u.util.stripSubs(rawArg).trim();
  if (!msg) {
    u.send("Say what?");
    return;
  }

  const speakerName = u.util.displayName(u.me, u.me);
  const active = _readActive(u.me);

  if (!active) {
    u.send(`You say, "${msg}"`);
    u.here.broadcast(`${speakerName} says, "${msg}"`, { except: u.me.id });
    return;
  }

  // deno-lint-ignore no-explicit-any
  const def = (LANG_DEFS as Record<string, any>)[active];
  if (!def) {
    u.send(`(Your active language "${active}" is not configured here.)`);
    u.send(`You say, "${msg}"`);
    u.here.broadcast(`${speakerName} says, "${msg}"`, { except: u.me.id });
    return;
  }

  u.send(`You say in ${active}, "${msg}"`);
  const listeners = (u.here.contents ?? []).filter(
    (o: IDBObj) => o.flags.has("connected") && o.id !== u.me.id,
  );
  for (const listener of listeners) {
    const skill = _skillIn(listener, active);
    const text = garble(msg, def, skill);
    u.send(`${speakerName} says in ${active}, "${text}"`, listener.id);

    // Passive learning: 10% chance to gain 1 skill point, up to 50
    if (skill < 50 && Math.random() < 0.10) {
      const newSkill = skill + 1;
      const key = active.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (key) {
        // deno-lint-ignore no-explicit-any
        const state = listener.state as Record<string, any>;
        if (!state.languages) state.languages = { known: {} };
        if (!state.languages.known) state.languages.known = {};
        state.languages.known[key] = newSkill;
        await u.db.modify(listener.id, "$set", {
          [`data.languages.known.${key}`]: newSkill,
        });
      }
    }
  }
};
