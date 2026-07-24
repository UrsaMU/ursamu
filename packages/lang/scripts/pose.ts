/// <reference types="./global.d.ts" />
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { gameHooks } from "@ursamu/ursamu";

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

function _renderQuoted(text: string, def: unknown, skill: number): string {
  return text.replace(
    /"([^"]*)"/g,
    (_, inner) =>
      `"${garble(inner, def as Parameters<typeof garble>[1], skill)}"`,
  );
}

export default async (u: IUrsamuSDK) => {
  const rawArg = (u.cmd.args[0] ?? u.cmd.original ?? "").toString();
  const msg = u.util.stripSubs(rawArg);
  if (!msg.trim()) {
    u.send("Pose what?");
    return;
  }

  const isSemi =
    u.cmd.name === ";" || (u.cmd.original ?? "").startsWith(";");
  const join = isSemi ? "" : " ";
  const speakerName = u.util.displayName(u.me, u.me);
  const active = await _readActive(u.me);

  if (!active || !msg.includes("\"")) {
    const line = `${speakerName}${join}${msg.trim()}`;
    u.send(line);
    u.here.broadcast(line, { except: u.me.id });
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

  u.send(`${speakerName}${join}${msg.trim()}`);
  const listeners = (u.here.contents ?? []).filter(
    (o: IDBObj) => o.flags.has("connected") && o.id !== u.me.id,
  );
  for (const listener of listeners) {
    const skill = await _skillIn(listener, active);
    const rendered = _renderQuoted(msg.trim(), def, skill);
    u.send(`${speakerName}${join}${rendered}`, listener.id);

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
