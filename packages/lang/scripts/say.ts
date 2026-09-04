/// <reference types="./global.d.ts" />
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import { gameHooks } from "@ursamu/mush";

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

async function _readActive(o: IDBObj): Promise<string | undefined> {
  const langs = (o.state as Record<string, unknown>)?.languages as
    | Record<string, unknown>
    | undefined;
  const a = langs?.active;
  const ctx = { player: o, active: typeof a === "string" ? a.toLowerCase() : undefined };
  await gameHooks.emit("language:get_active", ctx);
  return ctx.active;
}

async function _skillIn(o: IDBObj, name: string): Promise<number> {
  const langs = (o.state as Record<string, unknown>)?.languages as
    | Record<string, unknown>
    | undefined;
  const known = langs?.known as Record<string, unknown> | undefined;
  const v = known?.[name.toLowerCase()];
  let baseSkill = 0;
  if (typeof v === "number" && Number.isFinite(v)) {
    baseSkill = Math.max(0, Math.min(100, Math.floor(v)));
  }
  const ctx = { player: o, language: name.toLowerCase(), skill: baseSkill };
  await gameHooks.emit("language:get_skill", ctx);
  return Math.max(0, Math.min(100, Math.floor(ctx.skill)));
}

export default async (u: IUrsamuSDK) => {
  const rawArg = (u.cmd.args[0] ?? u.cmd.original ?? "").toString();
  const msg = u.util.stripSubs(rawArg).trim();
  if (!msg) {
    u.send("Say what?");
    return;
  }

  const speakerName = u.util.displayName(u.me, u.me);
  const active = await _readActive(u.me);

  if (!active) {
    u.send(`You say, "${msg}"`);
    u.here.broadcast(`${speakerName} says, "${msg}"`, { except: u.me.id });
    return;
  }

  // deno-lint-ignore no-explicit-any
  let def = (LANG_DEFS as Record<string, any>)[active];
  if (!def) {
    def = {
      schema: 1,
      name: active,
      mode: "phoneme",
      description: `Default generated language for ${active}`,
      onsets: ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "y"],
      nuclei: ["a", "e", "i", "o", "u"],
      codas: ["t", "s", "n", "r", "m", ""],
      syllablePatterns: ["CV", "CVC"],
      wordLenWeights: [0, 1, 4, 3, 2, 1],
      capitalize: "first"
    };
  }

  u.send(`You say in ${active}, "${msg}"`);
  const listeners = (u.here.contents ?? []).filter(
    (o: IDBObj) => o.flags.has("connected") && o.id !== u.me.id,
  );
  for (const listener of listeners) {
    const skill = await _skillIn(listener, active);
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
