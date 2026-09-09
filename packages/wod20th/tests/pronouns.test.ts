// tests/pronouns.test.ts -- pronoun set defaults + substitute() + +pronouns cmd.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../commands/pronouns.ts";

import {
  DEFAULT_PRONOUNS, PRONOUN_PRESETS,
  pronounsFor, substitute, subs,
} from "../core/pronouns.ts";
import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

function mockU(playerId: string, args: string[] = []) {
  const sent: string[] = [];
  const me: IDBObj = {
    id: playerId, name: "Hero",
    flags: new Set(["player", "connected"]),
    state: {}, location: "room-1", contents: [],
  };
  return Object.assign({
    me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+pronouns", original: "", args, switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => true,
    db: { modify: async () => {}, search: async () => [], create: async () => ({}), destroy: async () => {} },
    util: {
      target: async () => null,
      displayName: (o: IDBObj) => o.name ?? "?",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent });
}

// -- defaults + helpers ---------------------------------------------------

Deno.test("DEFAULT_PRONOUNS is they/them/their/theirs", OPTS, () => {
  assertEquals(DEFAULT_PRONOUNS, {
    subject: "they", object: "them", possessive: "their", absolute: "theirs",
  });
});

Deno.test("PRONOUN_PRESETS has he/she/they/it sets, all 4 fields", OPTS, () => {
  for (const k of ["he", "she", "they", "it"]) {
    const p = PRONOUN_PRESETS[k];
    assert(p, `missing preset: ${k}`);
    assert(p.subject && p.object && p.possessive && p.absolute);
  }
});

Deno.test("pronounsFor: char without pronouns -> default; with -> theirs", OPTS, () => {
  assertEquals(pronounsFor(null), DEFAULT_PRONOUNS);
  // deno-lint-ignore no-explicit-any
  const c: any = { pronouns: PRONOUN_PRESETS.she };
  assertEquals(pronounsFor(c).subject, "she");
});

// -- substitute() core ----------------------------------------------------

Deno.test("substitute: swaps all 8 tokens (incl. capitalized)", OPTS, () => {
  const out = substitute(
    "%s rakes %p talons. %S strikes. %o ducks. %O reels. %a are bloodied. %A are %a.",
    PRONOUN_PRESETS.she,
  );
  assertEquals(
    out,
    "she rakes her talons. She strikes. her ducks. Her reels. hers are bloodied. Hers are hers.",
  );
});

Deno.test("substitute: literal %% survives as %", OPTS, () => {
  const out = substitute("She rolled %s for 100%% effort -- %p best.", PRONOUN_PRESETS.she);
  assertEquals(out, "She rolled she for 100% effort -- her best.");
});

Deno.test("substitute: color codes + %r + %n untouched", OPTS, () => {
  const out = substitute("%ch%cyAlpha%cn%r%n grins. %s smiles.", PRONOUN_PRESETS.he);
  assertEquals(out, "%ch%cyAlpha%cn%r%n grins. he smiles.");
});

Deno.test("subs: char param resolves through pronounsFor", OPTS, () => {
  // deno-lint-ignore no-explicit-any
  const c: any = { pronouns: PRONOUN_PRESETS.it };
  assertEquals(subs("%s circles %p prey.", c), "it circles its prey.");
  assertEquals(subs("%s circles %p prey.", null), "they circles their prey.");
});

// -- +pronouns command ----------------------------------------------------

async function mkChar(id: string) {
  const c = await createChar(id, "wta");
  await setStatus(c.id, "approved");
  return (await findByPlayer(id))!;
}

Deno.test("+pronouns/set preset works", OPTS, async () => {
  const exec = getExec("+pronouns");
  await mkChar("pron-1");
  const u = mockU("pron-1", ["set", "she"]);
  await exec(u);
  const fresh = await findByPlayer("pron-1");
  assertEquals(fresh?.pronouns?.subject, "she");
  assertEquals(fresh?.pronouns?.absolute, "hers");
});

Deno.test("+pronouns/set custom xe/xem/xir/xirs works", OPTS, async () => {
  const exec = getExec("+pronouns");
  await mkChar("pron-2");
  const u = mockU("pron-2", ["set", "xe/xem/xir/xirs"]);
  await exec(u);
  const fresh = await findByPlayer("pron-2");
  assertEquals(fresh?.pronouns?.subject, "xe");
  assertEquals(fresh?.pronouns?.object, "xem");
  assertEquals(fresh?.pronouns?.possessive, "xir");
  assertEquals(fresh?.pronouns?.absolute, "xirs");
});

Deno.test("+pronouns/set rejects wrong arity + bad chars", OPTS, async () => {
  const exec = getExec("+pronouns");
  await mkChar("pron-3");
  for (const bad of ["he/him/his", "x/y/z/a/b", "xe/xem/x!r/xirs"]) {
    const u = mockU("pron-3", ["set", bad]);
    await exec(u);
    const fresh = await findByPlayer("pron-3");
    assertEquals(fresh?.pronouns, undefined, `should reject "${bad}"`);
  }
});

Deno.test("+pronouns/clear reverts to default", OPTS, async () => {
  const exec = getExec("+pronouns");
  const c = await mkChar("pron-4");
  c.pronouns = { ...PRONOUN_PRESETS.he };
  await saveChar(c);
  const u = mockU("pron-4", ["clear", ""]);
  await exec(u);
  const fresh = await findByPlayer("pron-4");
  assertEquals(fresh?.pronouns, DEFAULT_PRONOUNS);
});

Deno.test("+pronouns (no args) renders current set + token guide", OPTS, async () => {
  const exec = getExec("+pronouns");
  const c = await mkChar("pron-5");
  c.pronouns = { ...PRONOUN_PRESETS.they };
  await saveChar(c);
  const u = mockU("pron-5", ["", ""]);
  await exec(u);
  const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/their/.test(sent));
  assert(/Subject/.test(sent));
});
