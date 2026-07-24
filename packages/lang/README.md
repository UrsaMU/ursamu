# ursamu-language-plugin

> Per-listener language garbling for [UrsaMU](https://jsr.io/@ursamu/ursamu).
> Players learn languages on a 0–100 skill scale; every `say` and `pose` is
> re-rendered for each listener so that the *same line of speech* looks
> different to a fluent speaker, a beginner, and someone who doesn't know
> the language at all. Unknown portions are replaced with phonetically
> consistent fake words generated from configurable JSON language files.

JSR: [`@lhi/sgp-language-plugin`](https://jsr.io/@lhi/sgp-language-plugin)

---

## Table of Contents

- [Why this plugin exists](#why-this-plugin-exists)
- [Key features](#key-features)
- [Demo](#demo)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [In-game commands](#in-game-commands)
- [Skill tiers](#skill-tiers)
- [Authoring a language](#authoring-a-language)
- [Configuration](#configuration)
- [Layout](#layout)
- [Scripts and tasks](#scripts-and-tasks)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Extending the engine](#extending-the-engine)
- [Storage schema](#storage-schema)
- [License](#license)

---

## Why this plugin exists

UrsaMU ships with `say` and `pose` that broadcast the same string to every
listener. In a setting with multiple in-character languages — a tavern with
elves and orcs, a cantina with smugglers and Wookiees — that flattens the
roleplay: either *everyone* understands what was said, or *nobody* does.

This plugin makes speech **listener-relative**:

- The speaker chooses an active language (`+language/speak shyriiwook`).
- They use `say` / `pose` as normal.
- Each listener sees the line garbled in proportion to **their own** skill
  in that language. A fluent character sees clear text; a beginner sees a
  scatter of recognizable words; an outsider hears a stream of plausible
  but meaningless syllables that *sound* like the language.

The garbling is deterministic — the same word at the same skill bucket
always produces the same fake word — so two listeners with equal skill see
identical output, and a phrase remains recognizable across re-reads.

## Key features

- **Per-listener rendering.** Each connected listener gets their own pass
  through the garble pipeline; the speaker always sees their own line clear.
- **Five skill tiers** from "none" to "fluent", with smooth pass-through
  rates and accent substitutions in between.
- **Phoneme-driven fake speech.** Language defs are JSON: onsets, nuclei,
  codas, syllable patterns, word-length weights. Fakes look and sound like
  the language, not random noise.
- **Quote-aware poses.** In `pose`, only text inside `"…"` is garbled;
  surrounding action narration stays clear.
- **Deterministic.** `(word, langName, skillBucket)` seeds an FNV-1a +
  mulberry32 RNG, so output is reproducible and stable across reconnects.
- **Hot-reloadable.** `+language/reload` re-reads the JSON directory and
  re-bakes the override scripts without a restart.
- **Sandbox-safe.** The engine is *inlined* into `say.ts`/`pose.ts` at
  install time, because UrsaMU's script sandbox can't `import` from
  arbitrary paths.
- **Sample languages bundled:** Shyriiwook, Huttese, Sylvan.

## Demo

Run the showcase to see real per-listener output for every bundled
language at every skill tier:

```bash
deno task showcase
```

The output renders the language sheet, a say/pose matrix across five
skill levels, and a side-by-side "two listeners hear the same say" demo.

---

## Tech stack

| Layer        | Tech                                           |
|--------------|------------------------------------------------|
| Runtime      | [Deno](https://deno.com) ≥ 1.45 (uses `--unstable-kv`) |
| Host engine  | [`@ursamu/ursamu`](https://jsr.io/@ursamu/ursamu) ^2.3 |
| Language     | TypeScript (ESM, JSR-published)                |
| Storage      | Player `data.languages` on the UrsaMU object DB |

No npm, no Node, no build step — `deno task test` runs everything.

## Prerequisites

- **Deno 1.45+** — install from <https://deno.com/runtime>.
- An **UrsaMU** game directory (the working tree that contains
  `system/scripts/`, `config/config.json`, `db/`, etc.). The plugin
  installs override scripts into `system/scripts/`.

## Getting started

### 1. Install Deno

```bash
curl -fsSL https://deno.land/install.sh | sh   # macOS / Linux
# or: brew install deno
deno --version
```

### 2. Add the plugin to your UrsaMU game

From your UrsaMU game root (the dir with `system/`, `config/`, `db/`):

```bash
# Option A — JSR (recommended for production)
deno add @lhi/sgp-language-plugin

# Option B — local checkout for development
git clone https://github.com/.../sgp-language-plugin.git \
  plugins/sgp-language-plugin
```

Then register the plugin where UrsaMU loads plugins (typically your
`system/plugins.ts` or equivalent):

```ts
import sgpLanguage from "@lhi/sgp-language-plugin";
// or: import sgpLanguage from "./plugins/sgp-language-plugin/index.ts";

export const plugins = [
  sgpLanguage,
  // … your other plugins
];
```

### 3. Configure the languages directory (optional)

Default: `<gameRoot>/data/languages/`. Override by passing a `config`
field when registering the plugin, or by mutating `plugin.config`
before `init()` runs:

```ts
import sgpLanguage from "@lhi/sgp-language-plugin";
sgpLanguage.config = { languagesDir: "data/my-languages" };
```

### 4. First boot

On `init`, the plugin:

1. Creates the languages directory if missing.
2. Loads every `*.json` file inside it.
3. If empty, copies the three bundled sample langs (Shyriiwook, Huttese,
   Sylvan) into the directory so you have something to play with.
4. Bakes the garble engine + loaded defs into `system/scripts/say.ts`
   and `system/scripts/pose.ts`, keeping a `*.original.ts` backup of
   whatever was there before.

You should see:

```
[sgp-language] Loaded 3 language(s) from /…/data/languages.
[sgp-language] Installed say.ts override.
[sgp-language] Installed pose.ts override.
```

### 5. Try it in-game

```text
> +language/list
=== Languages === (configured)
  huttese       Slow, drawled trade language — open syllables, sibilants.
  shyriiwook    Wookiee speech — growling, throat-heavy syllables.
  sylvan        Sylvan elven — flowing liquids and long vowels.

> @wizard +language/learn me=shyriiwook/100
Set Wizard's shyriiwook skill to 100.

> +language/speak shyriiwook
You are now speaking shyriiwook.

> say Hello, friend.
You say in shyriiwook, "Hello, friend."
# Listeners with skill 0 see: rraagh, gruuk.
# Listeners with skill 50 see: rraagh, friend.
```

---

## Architecture

```
                ┌─────────────────────────────────────────┐
                │             UrsaMU engine               │
                │                                         │
   player ──►   │  say "hi"  ──►  system/scripts/say.ts   │
                │                       │                 │
                │                       ▼ (baked engine)  │
                │              ┌──────────────────┐       │
                │              │  garble(text,    │       │
                │              │   def, skill)    │       │
                │              └──────────────────┘       │
                │                       │                 │
                │              fan-out per listener       │
                │                       │                 │
   listeners ◄──┤   personalized strings via u.send(id)   │
                └─────────────────────────────────────────┘
```

### The inline trick

UrsaMU runs scripts (`system/scripts/*.ts`) in a sandbox that **cannot
`import` from arbitrary paths.** So we can't ship `say.ts` with
`import { garble } from "@lhi/sgp-language-plugin"`.

Instead, `src/install.ts` *bakes* the engine into the script at install
time:

1. `bakeScript()` reads `scripts/say.ts` from the plugin.
2. It replaces the `/* {{GARBLE_ENGINE}} */` marker with the inlined
   contents of `src/{schema,rng,phonemes,garble}.ts` (with `import` /
   `export` lines stripped).
3. It replaces the `/* {{LANG_DEFS}} */` marker with
   `const LANG_DEFS = {…};` — a JSON dump of every currently-loaded
   language.
4. The baked file is written to `system/scripts/say.ts`. The original
   is preserved as `say.original.ts` for `remove()` to restore.

`+language/reload` reruns the bake, so adding a language is a no-restart
operation.

### The garble pipeline

```
text ──► tokenize (words vs. punctuation)
            │
            ├─ punctuation ───────────────► passes through
            │
            └─ word
                  │
                  ▼
              seedFor(word, lang, bucket) ──► FNV-1a ──► mulberry32
                  │
                  ▼
        rng() < tier.passThrough ?
                  │
         ┌────────┴────────┐
         │                 │
        yes               no
         │                 │
         ▼                 ▼
    apply accentSubs    genWord(def, rng, syllableCountFor(len))
    (if tier.accent)       │
         │                 ▼
         │            applyCapitalization(fake, original, def.capitalize)
         │                 │
         └────────┬────────┘
                  ▼
                output token
```

Key invariants:

- **Seed excludes listener identity.** Two listeners at the same skill
  bucket see the same garbled string.
- **Punctuation and whitespace pass through.** Word count and rhythm are
  preserved for tiers ≥ 1.
- **Tier 0 (skill 0)** is the only tier that *doesn't* preserve word
  length — it generates fully fresh fake words, so even the syllable
  rhythm changes.
- **Tier 4 (skill ≥ 91)** is a fast-path: `garble` returns the input
  unmodified.

### Files at a glance

| File                       | Purpose                                                 |
|----------------------------|---------------------------------------------------------|
| `index.ts`                 | `IPlugin` definition. Loads languages, installs scripts on `init`, restores on `remove`. |
| `commands.ts`              | The `+language` command and its switches.               |
| `mod.ts`                   | JSR public exports (engine functions + types).          |
| `src/schema.ts`            | `LangDef` type, `validateLangDef` (strict).             |
| `src/rng.ts`               | FNV-1a hash, mulberry32 PRNG, weighted pick.            |
| `src/phonemes.ts`          | `genSyllable`, `genWord`, capitalization helper.        |
| `src/garble.ts`            | Tier table, the main `garble(text, def, skill)`.        |
| `src/langStore.ts`         | Loads / lists / validates the JSON language files.      |
| `src/playerLangs.ts`       | Per-player skill state + persistence (`u.db.modify`).   |
| `src/install.ts`           | Backup, bake, install, and restore the override scripts.|
| `src/inline.ts`            | The bake step — `import`/`export` stripper + concat.    |
| `scripts/say.ts`           | The override `say` (with `{{GARBLE_ENGINE}}` markers).  |
| `scripts/pose.ts`          | The override `pose`/`:`/`;`.                            |
| `languages/*.json`         | Bundled sample language defs.                           |
| `help/language.md`         | In-game help text for `+help language`.                 |
| `tools/showcase.ts`        | CLI demo — renders every tier × every bundled language. |

---

## In-game commands

| Command                                  | Lock      | Description                                              |
|------------------------------------------|-----------|----------------------------------------------------------|
| `+language`                              | connected | Show your known languages + active one (sorted by skill).|
| `+language/speak <name>`                 | connected | Set `<name>` as your active speech.                      |
| `+language/clear`                        | connected | Stop speaking any language; `say`/`pose` are clear.      |
| `+language/list`                         | connected | List every language configured on this game.             |
| `+language/learn <player>=<lang>/<n>`    | staff     | (admin/wizard) Set `<player>`'s skill in `<lang>` to `n`.|
| `+language/reload`                       | wizard    | Re-scan languages dir + re-bake `say.ts`/`pose.ts`.      |

You can also use `+lang` as an alias for `+language`.

Examples:

```text
+language
+language/speak huttese
say Get out of my forest.
pose growls and says "Leave us." then turns away.
+language/learn Alice=huttese/75
+language/clear
+language/reload
```

## Skill tiers

| Skill   | Tier name   | passThrough | preserveLength | accentSubs | Behavior                                              |
|---------|-------------|-------------|----------------|------------|-------------------------------------------------------|
| 0       | none        | 0.00        | no             | no         | Fully garbled; only word/punctuation count preserved  |
| 1–25    | smattering  | 0.00        | yes            | no         | Fully garbled but with the original word's syllable count |
| 26–60   | passing     | 0.30        | yes            | yes        | ~30% of words pass through; rest are fake + accented  |
| 61–90   | proficient  | 0.70        | yes            | yes        | ~70% of words pass through; light accent on rest      |
| 91–100  | fluent      | 1.00        | yes            | no         | Clear text — `garble()` is a no-op                    |

Because seeds bucket on the tier (0–4), a character at skill 26 and one
at skill 60 see *identical* output. Skill changes only matter when they
cross a tier boundary.

## Authoring a language

A language is a single JSON file in your `languagesDir`:

```json
{
  "schema": 1,
  "name": "shyriiwook",
  "mode": "phoneme",
  "description": "Wookiee speech — growling, throat-heavy syllables.",
  "onsets":   ["k", "g", "r", "rr", "gr"],
  "nuclei":   ["aa", "uu", "oo"],
  "codas":    ["k", "rr", "gh", ""],
  "syllablePatterns": ["CV", "CVC", "CCV"],
  "wordLenWeights":   [0, 2, 4, 3, 2, 1],
  "capitalize": "first",
  "accentSubs": { "s": "rh", "th": "k" }
}
```

### Field reference

| Field              | Type                          | Required | Notes |
|--------------------|-------------------------------|----------|-------|
| `schema`           | `1`                           | yes      | Versioning. Only `1` is supported. |
| `name`             | `string`                      | yes      | Lowercase recommended; collisions resolve case-insensitively. |
| `mode`             | `"phoneme"` \| `"markov"`     | yes      | `markov` is reserved for v2 — validation rejects it. |
| `onsets`           | `string[]`                    | yes      | Consonant clusters that can start a syllable. |
| `nuclei`           | `string[]` (non-empty)        | yes      | Vowel sounds. The pool drawn for every `V` slot. |
| `codas`            | `string[]`                    | yes      | Consonants ending a syllable. Include `""` for open syllables. |
| `syllablePatterns` | `string[]` of `C`/`V`         | yes      | E.g. `"CV"`, `"CVC"`, `"CCV"`. Weight by repetition. |
| `wordLenWeights`   | `number[]` (non-negative)     | yes      | Index = syllable count, value = relative weight. `[0, 2, 4, 3, 2, 1]` = "never 0 syllables, mostly 2–3". Must sum > 0. |
| `capitalize`       | `"first"`\|`"all"`\|`"none"`  | no       | Default `"first"`. Capitalization rule for fakes; `"first"` mirrors the original word's case. |
| `accentSubs`       | `Record<string, string>`      | no       | Substring replacements applied to *pass-through* words at tier 2–3. Run in object-key order. |
| `description`      | `string`                      | no       | Shown by `+language/list`. |

### Tuning tips

- **Want longer words?** Bias `wordLenWeights` toward higher indices.
- **Want a "growly" feel?** Restrict `nuclei` to `["aa", "uu"]` and load
  `codas` with `["rr", "gh", "k"]`.
- **Want fluent speakers to still feel an accent at proficiency?** Add
  `accentSubs` — they only fire at tiers 2 (passing) and 3 (proficient).
- **Patterns are picked with uniform weight per entry.** To bias toward
  `"CVC"`, list it multiple times: `["CV", "CVC", "CVC", "CVC"]`.

### Validation

The loader rejects:

- non-JSON, missing required fields
- unknown `mode` (or `markov`)
- patterns containing characters other than `C` and `V`
- empty `nuclei`
- `wordLenWeights` summing to 0
- invalid `capitalize` value

Errors are reported on boot:

```
[sgp-language] Errors:
  badlang.json: schema must be 1
  badlang.json: invalid syllable pattern "CXV" (use C and V only)
```

…and surfaced again on `+language/reload`.

---

## Configuration

| Key            | Default            | Description |
|----------------|--------------------|-------------|
| `languagesDir` | `data/languages`   | Directory the plugin scans for `*.json` definitions. Relative paths resolve from `Deno.cwd()`. Absolute paths are used verbatim. |

Apply by setting `plugin.config` before the engine calls `init()`:

```ts
import sgpLanguage from "@lhi/sgp-language-plugin";
sgpLanguage.config = { languagesDir: "/srv/ursamu/langs" };
```

---

## Layout

```
ursamu-language-plugin/
├── index.ts              IPlugin entry; load + install + seed samples
├── commands.ts           +language command + switches
├── mod.ts                JSR exports
├── deno.json             tasks, jsr name/version, imports, publish list
├── config/
│   └── config.json       Example UrsaMU config (for dev setups)
├── help/
│   └── language.md       In-game +help language text
├── languages/            Bundled sample language defs
│   ├── huttese.json
│   ├── shyriiwook.json
│   └── sylvan.json
├── scripts/              Override scripts (templated with bake markers)
│   ├── say.ts
│   └── pose.ts
├── src/                  Engine — TypeScript, fully tested
│   ├── schema.ts
│   ├── rng.ts
│   ├── phonemes.ts
│   ├── garble.ts
│   ├── langStore.ts
│   ├── playerLangs.ts
│   ├── install.ts
│   └── inline.ts
├── tests/                Deno tests (one *.test.ts per src module)
├── tools/
│   └── showcase.ts       deno task showcase
└── docs/                 Deeper docs (architecture, language authoring, etc.)
```

## Scripts and tasks

| Task                    | What it does                                              |
|-------------------------|-----------------------------------------------------------|
| `deno task test`        | Run the full test suite with `-A --unstable-kv`.          |
| `deno task lint`        | `deno lint`. Excludes `scripts/` (templated, not standalone). |
| `deno task check`       | `deno check index.ts mod.ts` — full type-check from both entry points. |
| `deno task showcase`    | Render the live demo described in [Demo](#demo).          |

## Testing

Tests live in `tests/`, one file per `src/` module plus an `auth.test.ts`
for the lock checks. Run all of them:

```bash
deno task test
```

Strategies in use:

- **Determinism.** `seedFor` is deterministic, so `garble.test.ts`
  asserts both same-input/same-output and same-tier/same-output.
- **Schema validation.** `schema.test.ts` covers every required-field
  and bad-value error path.
- **Atomic writes.** `playerLangsAtomic.test.ts` runs concurrent
  `setSkill`/`setActive` to make sure the local mirror and DB don't
  diverge under interleaving.
- **No mocks for the host SDK.** Tests use thin fakes for `IUrsamuSDK`
  and `IDBObj` rather than mocking JSR types — keeps the test surface
  honest.

## Deployment

This plugin runs inside an UrsaMU game; deploy it the way you deploy
your game.

### Add the plugin

```bash
cd /path/to/your/ursamu-game
deno add @lhi/sgp-language-plugin
```

Register it in your plugins entry point (see [Getting started](#getting-started)).

### Persistent storage

The plugin **does not introduce a new collection.** It writes
`data.languages` onto your player objects via the host's `u.db.modify`,
so it inherits whatever DB engine UrsaMU is configured with. Nothing to
provision separately.

### Updating

```bash
deno add @lhi/sgp-language-plugin@latest
```

Then in-game: `+language/reload` to re-bake the override scripts against
the new code.

### Removing

The plugin's `remove()` restores `say.original.ts` / `pose.original.ts`
if they exist, otherwise deletes the override files. If you stop
loading the plugin without calling `remove()`, the baked scripts will
still run — but they no longer need anything from the plugin.

### Source-control hygiene

The override scripts written into `system/scripts/say.ts` and
`system/scripts/pose.ts` are generated. Treat them like build output:
either commit them deliberately when you ship a new bundle, or add to
`.gitignore`:

```
system/scripts/say.ts
system/scripts/pose.ts
system/scripts/say.original.ts
system/scripts/pose.original.ts
```

---

## Troubleshooting

### `[sgp-language] Failed to install say.ts: …`

The plugin couldn't write into `<cwd>/system/scripts/`. Either the
directory doesn't exist (you're not running from the game root) or the
process doesn't have write permissions.

Run from the UrsaMU game root, and make sure `system/scripts/` exists
and is writable.

### `Your active language "x" is not configured here.`

The plugin loaded fine, but the language file `x.json` isn't in
`languagesDir`. Fix:

```text
+language/list                 # see what's actually loaded
+language/reload               # after copying the file in
```

### Garbled output looks identical for every listener

That's by design — the seed doesn't include listener identity, so two
listeners *at the same skill tier* see the same garbled string. Adjust
their skills so they cross a tier boundary (e.g. one at 25, one at 26)
to see differentiated output.

### A new language file isn't picked up

Did you run `+language/reload`? The directory is only scanned on `init`
and on reload — adding a `*.json` at runtime won't be seen until you
ask for it.

### `+language/learn` says "Permission denied."

You need the `admin` or `wizard` flag. `+language/reload` requires
`wizard` specifically.

### The original `say` / `pose` came back after I removed the plugin

The `remove()` hook restored `*.original.ts`. If you re-add the plugin,
`installScripts()` will create new backups before overwriting again.

---

## Extending the engine

The whole engine is exposed via `mod.ts` for use in tooling, tests, or
other plugins:

```ts
import {
  garble, tierFor, validateLangDef, loadLanguages, listLangs,
} from "@lhi/sgp-language-plugin";

const report = await loadLanguages("./data/languages");
const def = listLangs()[0];
console.log(garble("Hello, friend.", def, 25));
```

Player-state helpers (`setSkill`, `setActive`, `getPlayerLangs`,
`skillIn`, `clampSkill`) are also exported, so other plugins (chargen,
training rooms, plot hooks) can manipulate language skills the same way
`commands.ts` does.

### Adding a new mode

`mode: "markov"` is reserved in the schema but rejected by the
validator. To add it: implement a markov-chain `genWord` variant in a
new `src/markov.ts`, dispatch on `def.mode` in `garble.ts`, and add the
file to `SRC_FILES` in `src/inline.ts` so it gets baked into the
override scripts.

## Storage schema

Per-player state lives on the UrsaMU player object under `data.languages`:

```ts
interface PlayerLangs {
  known: Record<string, number>;   // lowercased name → 0-100
  active?: string;                  // lowercased name
}
```

Mutations go through `setSkill` / `setActive`, which both update the
in-memory `dbo.state` mirror **and** persist via `u.db.modify(... "$set"/"$unset" ...)`
so reconnects pick up the same state.

---

## License

ISC. See `LICENSE` if present, or the JSR package page for terms.
