// deno-lint-ignore-file require-await
/**
 * @module stdlib/object-compat
 *
 * RhostMUSH/TinyMUX object compatibility functions:
 * ueval, u2/u2local, obj/subj/poss/aposs pronoun functions,
 * set/wipe as function wrappers (emit @command sentinel).
 */

import { register } from "./registry.ts";
import { resolveObj } from "./object-shared.ts";
import type { EvalContext } from "../context.ts";
import type { UrsaEvalContext } from "../context.ts";
import { isTooDeep, toLibCtx } from "../context.ts";

// ── u2 / u2local — two-arg user-function aliases ──────────────────────────────
// u2/u2local are RhostMUSH names for u/ulocal with exactly two arguments.
// They share the same semantics; just alias.

import { lookup } from "./registry.ts";

// Registered after object-attrs.ts, so lookup() finds u/ulocal.
[["u2", "u"], ["u2local", "ulocal"]].forEach(([alias, original]) => {
  const fn = lookup(original);
  if (fn) register(alias, fn);
});

// ── ueval(actor-ref, attr-spec, args...) ─────────────────────────────────────
// Like u() but runs the attr with a different enactor (actor).

register("ueval", async (a, ctx) => {
  const uctx     = ctx as unknown as UrsaEvalContext;
  if (isTooDeep(uctx)) return "#-1 TOO DEEP";
  const newActor = await resolveObj(a[0] ?? "me", ctx);
  if (!newActor) return "#-1 NOT FOUND";
  const spec     = a[1] ?? "";
  const args     = a.slice(2);
  const slashI   = spec.indexOf("/");
  const objRef   = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attrName = slashI >= 0 ? spec.slice(slashI + 1) : spec;
  const obj      = await resolveObj(objRef, ctx);
  if (!obj) return "#-1 NOT FOUND";
  const code = await uctx.db.getAttribute(obj, attrName);
  if (code === null) return "";
  const subCtx: UrsaEvalContext = {
    ...uctx,
    enactor:  newActor.id,
    actor:    newActor,
    executor: obj,
    caller:   uctx.executor,
    args,
    depth:    uctx.depth + 1,
  };
  return uctx._engine.evalString(code, toLibCtx(subCtx));
});

// ── obj / subj / poss / aposs — pronoun function forms ───────────────────────
// These return pronouns for the object referenced, based on its SEX attribute.
// The %s/%o/%p/%a substitutions handle the enactor's pronouns inline;
// these function forms let softcode query pronouns for arbitrary objects.

type PronounKey = "subj" | "obj" | "poss" | "abs";
type Sex = "male" | "female" | "neutral" | "plural";

const PRONOUNS: Record<Sex, Record<PronounKey, string>> = {
  male:    { subj: "he",   obj: "him",  poss: "his",   abs: "his"    },
  female:  { subj: "she",  obj: "her",  poss: "her",   abs: "hers"   },
  neutral: { subj: "it",   obj: "it",   poss: "its",   abs: "its"    },
  plural:  { subj: "they", obj: "them", poss: "their", abs: "theirs" },
};

async function pronounFor(key: PronounKey, a: string[], ctx: EvalContext): Promise<string> {
  const uctx = ctx as unknown as UrsaEvalContext;
  const obj  = a[0] ? await resolveObj(a[0], ctx) : uctx.actor;
  if (!obj) return "#-1 NOT FOUND";
  const raw = ((await uctx.db.getAttribute(obj, "SEX")) ?? "").toLowerCase();
  let sex: Sex = "neutral";
  if (raw.startsWith("m")) sex = "male";
  else if (raw.startsWith("f")) sex = "female";
  else if (raw.startsWith("p") || raw.startsWith("t")) sex = "plural";
  const word = PRONOUNS[sex][key];
  return a[1] === "1" ? word[0].toUpperCase() + word.slice(1) : word;
}

register("subj", async (a, ctx) => pronounFor("subj", a, ctx));
register("obj",  async (a, ctx) => pronounFor("obj",  a, ctx));
register("poss", async (a, ctx) => pronounFor("poss", a, ctx));
register("aposs",async (a, ctx) => pronounFor("abs",  a, ctx));

// ── set(obj, attr=value) / wipe(obj, attr-pattern) — command wrappers ─────────
// These emit the @set / @wipe @command via the sentinel channel and return "1".
// Side effects are async (processed after the softcode eval completes).

register("set", async (a, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  const target = a[0] ?? "";
  const spec   = a[1] ?? "";
  uctx.output.send(`\x00atcmd\x00@set ${target}/${spec}`, uctx.actor.id);
  return "1";
});

register("wipe", async (a, ctx) => {
  const uctx    = ctx as unknown as UrsaEvalContext;
  const target  = a[0] ?? "";
  const pattern = a[1] ?? "*";
  uctx.output.send(`\x00atcmd\x00@wipe ${target}/${pattern}`, uctx.actor.id);
  return "1";
});

