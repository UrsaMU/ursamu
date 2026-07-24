# Architecture

This document describes how `ursamu-language-plugin` is wired together,
why each piece exists, and how data flows from a player typing `say` to
each listener seeing personalized output.

## Goals and constraints

The plugin was designed against three concrete constraints:

1. **The host's script sandbox can't import arbitrary modules.** UrsaMU
   loads `system/scripts/*.ts` files in a restricted runtime — anything
   they need at runtime has to be present in the file itself.
2. **Speech must be listener-relative.** The same `say` must produce a
   different string for every listener in the room based on *that
   listener's* skill in *the speaker's* active language.
3. **Output must be deterministic across reads.** A line of garbled
   speech logged to a `+pagebuffer`, replayed, or seen by two listeners
   with the same skill must be identical, so it doesn't feel like
   noise.

Everything in the architecture is a consequence of these three
constraints.

## Layered view

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 5 — Host integration (UrsaMU)                          │
│   - system/scripts/say.ts       (overridden)                 │
│   - system/scripts/pose.ts      (overridden)                 │
│   - addCmd("+language", …)                                   │
├──────────────────────────────────────────────────────────────┤
│ Layer 4 — Install / build                                    │
│   - src/install.ts    backup + bake + write                  │
│   - src/inline.ts     strip module syntax, splice templates  │
├──────────────────────────────────────────────────────────────┤
│ Layer 3 — Application                                        │
│   - commands.ts       +language switches                     │
│   - src/playerLangs.ts  PlayerLangs persistence              │
│   - src/langStore.ts    in-memory language registry          │
├──────────────────────────────────────────────────────────────┤
│ Layer 2 — Engine                                             │
│   - src/garble.ts      tier table + main pipeline            │
│   - src/phonemes.ts    syllable + word generation            │
├──────────────────────────────────────────────────────────────┤
│ Layer 1 — Primitives                                         │
│   - src/rng.ts         FNV-1a, mulberry32, weighted pick     │
│   - src/schema.ts      LangDef type + strict validation      │
└──────────────────────────────────────────────────────────────┘
```

Layers 1–3 are normal TypeScript modules. Layer 4 takes layers 1–2 and
*inlines* them into the layer-5 override scripts at install time, so
the sandbox never has to import anything.

## The bake step

This is the most unusual piece of the architecture, so it gets its own
section.

`system/scripts/say.ts` cannot do `import { garble } from "../../src/garble.ts"`
— the sandbox refuses non-relative or out-of-tree imports. So the
shipped `scripts/say.ts` is a *template* with two markers:

```ts
/* {{GARBLE_ENGINE}} */
/* {{LANG_DEFS}} */
```

When the plugin's `init()` runs, `installScripts()`:

1. Resolves the plugin's `scripts/` dir (`pluginScriptsDir`) and the
   host engine's `system/scripts/` dir (`engineScriptsDir = cwd/system/scripts`).
2. For each of `say.ts`, `pose.ts`:
   - Backs up the existing file to `<name>.original.ts` (only if no
     backup yet — never clobbers an existing backup).
   - Calls `bakeScript(srcPath)`:
     - Reads `src/{schema,rng,phonemes,garble}.ts`.
     - Strips `import ... ;`, `export function`/`const`/`type`/...
       prefixes, and bare `export { ... }` lines via `stripModuleSyntax`.
     - Concatenates them with a banner comment.
     - Substitutes that snippet in for `/* {{GARBLE_ENGINE}} */`.
     - Substitutes `const LANG_DEFS = <JSON>;` in for `/* {{LANG_DEFS}} */`.
   - Writes the result to `system/scripts/<name>.ts`.

`+language/reload` re-runs `installScripts()` after `loadLanguages()`,
so adding or editing a language file is a no-restart operation.

`remove()` walks the same `SCRIPTS` list and either restores
`*.original.ts` or deletes the override file.

### Why not eval at script start?

Two reasons. First, the sandbox restricts `eval` / `new Function`.
Second, the engine has to be loaded *before* the script runs — the
script's `default` export is awaited by the host. Inlining makes the
engine part of the file's top-level scope, which the sandbox does
allow.

## The garble pipeline

`garble(text, def, skill)` is the only function the override scripts
call. Its tier table:

| Skill range | Bucket | passThrough | preserveLength | accent |
|-------------|--------|-------------|----------------|--------|
| 91–100      | 4      | 1.0         | true           | false  |
| 61–90       | 3      | 0.70        | true           | true   |
| 26–60       | 2      | 0.30        | true           | true   |
| 1–25        | 1      | 0.0         | true           | false  |
| 0           | 0      | 0.0         | false          | false  |

Pipeline per token:

1. Tokenize with `/([A-Za-z']+)|([^A-Za-z']+)/g`. Non-word matches
   (punctuation, whitespace) pass through unchanged.
2. For each word match, compute `seedFor(word, def.name, tier.bucket)`
   → `fnv1a("word|lang|bucket")`. Feed into `mulberry32` for a
   deterministic PRNG.
3. Roll `rng() < tier.passThrough`. On success:
   - If `tier.accent && def.accentSubs`, apply substring substitutions
     in object-key order. (Pass-through preserves the original spelling
     otherwise.)
4. On failure (or always at tiers 0/1):
   - `tier.preserveLength` → use `syllableCountFor(word.length)` as a
     target syllable count.
   - `genWord(def, rng, target)` builds a fake word from the def's
     onsets/nuclei/codas/patterns.
   - `applyCapitalization(fake, originalWord, def.capitalize ?? "first")`
     reapplies casing.

Tier-4 has a fast path: `garble` returns the input unchanged.

### Why bucket on the tier, not the skill?

If the seed used raw skill, a character grinding from 60 to 70 would
see *every* word in *every* language slowly rotate as they trained.
Bucketing on the tier means output is stable within a tier — training
crosses meaningful thresholds, not noise.

It also means we can't leak listener identity into the output. Two
listeners at the same tier see byte-identical strings, which is the
right thing for narrative consistency.

## Player state

`PlayerLangs` is stored on the player object's `state.languages`:

```ts
{ known: { "shyriiwook": 80, "huttese": 30 }, active: "shyriiwook" }
```

`playerLangs.ts` exposes:

- `getPlayerLangs(dbo)` — typed read, with `safeKey` normalization and
  `clampSkill` clamping.
- `skillIn(dbo, langName)` — convenience for the override scripts.
- `setSkill(u, dbo, lang, n)` / `setActive(u, dbo, lang | null)` — mutate
  both the local `state` mirror and persist via
  `u.db.modify(id, "$set"|"$unset", …)`.
- `clampSkill(n)` — `Math.max(0, Math.min(100, Math.floor(n)))`.

Two design notes:

- **Local mirror first.** We update `dbo.state` *before* awaiting
  `u.db.modify`, so synchronous reads later in the same handler see the
  new value. The DB write is fire-and-await afterwards.
- **Dotted DB paths.** `setSkill` uses
  `{ [`data.languages.known.${key}`]: value }` so the host's DB layer
  performs a partial update rather than rewriting the whole document.

## Language store

`langStore.ts` keeps a `Map<string, LangDef>` keyed by lowercase name.
`loadLanguages(dir)`:

1. Calls `clearLangs()`.
2. Walks `dir` for `*.json`.
3. For each file: `JSON.parse` → `validateLangDef` → `store.set` on
   success, or push to `report.errors` on failure.
4. Returns `{ loaded, errors }`.

`registerLangForTest(def)` is the test seam — it lets unit tests inject
a def without writing to disk.

## Override scripts

Both `scripts/say.ts` and `scripts/pose.ts` follow the same shape:

```
1. read speaker's state.languages.active
2. if no active language → broadcast clear; done
3. look up def in LANG_DEFS; if missing → warn speaker, broadcast clear
4. echo to speaker (always clear)
5. for each connected listener except the speaker:
     skill = listener.state.languages.known[active] ?? 0
     text  = garble(msg, def, skill)        (say)
           | text.replace(/"…"/g, … garble … ) (pose)
     u.send(text, listener.id)
```

`pose` differs only in that it splits on `"…"` so action text outside
quoted spans is untouched. It also handles the `;` semipose (no leading
space between name and pose body) and the `:` regular pose.

## What's intentionally absent

- **No "language groups" or family inheritance.** Two related dialects
  are two separate files. (You can share a JSON object by `cat`-ing it
  and tweaking, but the engine treats them independently.)
- **No "overhear partial" mechanic.** A skill-0 listener still gets a
  fully-formed garbled string; they don't get "you hear someone
  speaking shyriiwook." That's a host-side concern (e.g. a wrapper that
  decides whether to *deliver* the message at all).
- **No persistence inside the plugin's own collection.** All player
  state lives on the player object via the host's DB. Removing the
  plugin doesn't orphan a separate table.
- **`markov` mode.** Reserved in the schema, rejected by the validator.
  Adding it is a one-file change (`src/markov.ts`) plus a dispatch in
  `garble.ts` plus inclusion in `SRC_FILES`.
