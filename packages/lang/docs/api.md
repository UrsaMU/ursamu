# Public API (`mod.ts`)

Everything reachable via the JSR package's default exports.

```ts
import * as lang from "@lhi/sgp-language-plugin";
```

## Plugin

### `default` / `plugin: IPlugin`

The UrsaMU plugin instance. Register it with your host.

```ts
import sgpLanguage from "@lhi/sgp-language-plugin";
sgpLanguage.config = { languagesDir: "data/languages" };
```

| Field         | Type                              | Notes                          |
|---------------|-----------------------------------|--------------------------------|
| `name`        | `"sgp-language-plugin"`           | —                              |
| `version`     | `string`                          | Sourced from `deno.json`.      |
| `description` | `string`                          | —                              |
| `config`      | `{ languagesDir?: string }`       | Set before `init` runs.        |
| `init`        | `() => Promise<boolean>`          | Called by the host.            |
| `remove`      | `() => Promise<void>`             | Called by the host on unload.  |

## Engine

### `garble(text: string, def: LangDef, skill: number): string`

The core function. Returns a garbled version of `text` per the
language and listener skill.

- `text` — any string. Whitespace and punctuation pass through.
- `def` — a validated `LangDef`.
- `skill` — 0–100. Out-of-range values are clamped via the tier
  function (`Math.max(0, Math.min(100, Math.floor(skill)))`).

Determinism: equal `(text, def.name, tierFor(skill).bucket)` always
produces the same output.

### `tierFor(skill: number): SkillTier`

Returns the tier descriptor for a given skill.

```ts
interface SkillTier {
  bucket: number;          // 0..4
  passThrough: number;     // 0..1
  preserveLength: boolean; // tier ≥ 1
  accent: boolean;         // tier 2 and 3
}
```

Useful for displaying tier names in UI:

```ts
const t = tierFor(50);
// { bucket: 2, passThrough: 0.3, preserveLength: true, accent: true }
```

## Phonemes

### `genWord(def: LangDef, rng: () => number, approxLen?: number): string`

Builds a fake word. If `approxLen` is set, uses it as the syllable
count; otherwise weighted-picks from `def.wordLenWeights`.

### `genSyllable(def: LangDef, rng: () => number, isLast: boolean): string`

Builds a single syllable. `isLast` controls whether the trailing `C`
in a pattern draws from `codas` (`true` and `codas.length > 0`) or
from `onsets`.

### `syllableCountFor(wordLen: number): number`

Maps original word length → target syllable count for length-preserving
tiers. See the table in [authoring-languages](./authoring-languages.md).

## RNG

### `fnv1a(str: string): number`

FNV-1a 32-bit hash. Output is `>>> 0` (unsigned).

### `mulberry32(seed: number): () => number`

Returns a deterministic PRNG seeded with `seed`. Each call returns
`[0, 1)`.

### `seedFor(word: string, langName: string, skillBucket: number): number`

The seed used by `garble`. Equal arguments → equal output. The
`word` is lowercased before hashing.

## Schema

### `LangDef`

```ts
interface LangDef {
  schema: 1;
  name: string;
  mode: "phoneme" | "markov";
  onsets: string[];
  nuclei: string[];
  codas: string[];
  syllablePatterns: string[];     // strings of C / V
  wordLenWeights: number[];       // index = syllable count
  capitalize?: "first" | "all" | "none";
  accentSubs?: Record<string, string>;
  description?: string;
}
```

### `validateLangDef(raw: unknown, fileLabel: string): ValidationResult`

```ts
interface ValidationResult {
  ok: boolean;
  errors: string[];
}
```

Strict — rejects any extra/missing/invalid field and reports every
error it finds in one pass. `fileLabel` is prepended to each error
message.

## Language store

### `loadLanguages(dir?: string): Promise<LoadReport>`

Walks `dir` for `*.json`, validates each, and replaces the in-memory
store. Returns `{ loaded: string[], errors: string[] }`.

### `listLangs(): LangDef[]`

All currently-loaded defs, sorted by `name`.

### `getLang(name: string): LangDef | undefined`

Lookup by name (case-insensitive).

### `clearLangs(): void`

Empty the store.

### `setLanguagesDir(dir: string): void` / `getLanguagesDir(): string`

Configure / read the default directory used by `loadLanguages()` when
called without arguments.

### `registerLangForTest(def: LangDef): void`

Inject a def into the store without disk I/O. For unit tests.

## Player state

### `getPlayerLangs(dbo: IDBObj): PlayerLangs`

```ts
interface PlayerLangs {
  known: Record<string, number>; // lowercased name → 0-100
  active?: string;                // lowercased name
}
```

Reads `dbo.state.languages` with normalization and clamping. Safe to
call on a player with no language state — returns `{ known: {} }`.

### `skillIn(dbo: IDBObj, langName: string): number`

Convenience: `getPlayerLangs(dbo).known[langName.toLowerCase()] ?? 0`.

### `clampSkill(n: number): number`

`Math.max(0, Math.min(100, Math.floor(n)))`. Non-finite → `0`.

### `setSkill(u, dbo, langName, skill): Promise<void>`

Persist a player's skill. Updates both the in-memory `dbo.state`
mirror and the database via `u.db.modify(... "$set" ...)`.

### `setActive(u, dbo, langName | null): Promise<void>`

Set or clear the active language. `null` clears with `$unset`.
