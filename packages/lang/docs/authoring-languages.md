# Authoring a language

A "language" in this plugin is a JSON file describing how to build
plausible fake words. This guide walks through every field, the
trade-offs, and a worked example.

## The minimal file

```json
{
  "schema": 1,
  "name": "exampleish",
  "mode": "phoneme",
  "onsets": ["k", "t", "s"],
  "nuclei": ["a", "i", "o"],
  "codas": [""],
  "syllablePatterns": ["CV"],
  "wordLenWeights": [0, 1, 2, 1]
}
```

That's enough to validate. Save it as `data/languages/exampleish.json`,
run `+language/reload`, and you'll see it in `+language/list`.

## Field reference

### `schema` *(required, must be `1`)*

Versioning hook. Only `1` is supported. A `2` would imply breaking
changes to the file format.

### `name` *(required, string)*

The identifier. **Lowercased on use** — `getLang("Shyriiwook")`,
`+language/speak SHYRIIWOOK`, and `name: "Shyriiwook"` all resolve to
the same language. Use lowercase in the file to keep it boring.

### `mode` *(required, `"phoneme"` or `"markov"`)*

Only `"phoneme"` works in v1. `"markov"` is reserved and **explicitly
rejected** by the validator with `markov mode not implemented in v1`.
If you set it, the language won't load.

### `onsets` *(required, `string[]`)*

The consonant clusters that can appear at the *start* of a syllable
(every `C` slot that isn't the final coda position).

```json
"onsets": ["k", "g", "r", "rr", "gr"]
```

Each entry is a literal string — they're not letters, they're chunks.
`"rr"`, `"sh"`, `"ng"` are all single onsets.

Tips:

- Repeat an onset to weight it heavier: `["k", "k", "k", "g", "r"]`
  makes `k` show up ~60% of the time.
- An empty string `""` is legal and produces a vowel-initial syllable
  even in a `CV` pattern — but using a `V` pattern is usually clearer.

### `nuclei` *(required, `string[]`, must be non-empty)*

Vowel sounds. Drawn for every `V` slot.

```json
"nuclei": ["a", "o", "u", "ee", "ai", "oo"]
```

`""` is **not** useful here — `genSyllable` will happily produce an
empty syllable, which usually isn't what you want.

### `codas` *(required, `string[]`)*

Consonants that end the **last** syllable of a word, in the trailing
`C` slot. Earlier `C` slots draw from `onsets`.

```json
"codas": ["k", "rr", "gh", ""]
```

Include `""` to allow open syllables (no coda). The current engine only
uses `codas` for the final syllable's trailing `C` — middle-syllable
trailing `C`s still draw from `onsets`. That's intentional: it gives
the language a recognizable "ending" feel.

### `syllablePatterns` *(required, `string[]` of `C`/`V`)*

The valid syllable shapes. Each entry is a string made *only* of `C`
and `V` — `"CV"`, `"V"`, `"CVC"`, `"CCV"`, `"CVCC"`, etc. The validator
rejects anything else.

```json
"syllablePatterns": ["CV", "CVC", "CCV"]
```

Patterns are picked **with uniform weight per entry.** To bias toward a
shape, list it multiple times:

```json
"syllablePatterns": ["CV", "CV", "CV", "CVC", "CCV"]
```

→ 3/5 of syllables are `CV`.

### `wordLenWeights` *(required, non-negative `number[]`)*

Index → syllable count. Value → relative weight. Must sum to > 0.

```json
"wordLenWeights": [0, 2, 4, 3, 2, 1]
```

means: never zero-syllable words, sometimes 1-syllable, mostly 2- and
3-syllable, occasionally 4 or 5. The numbers are *relative* — `[0, 2, 4]`
and `[0, 200, 400]` behave identically.

This only matters at tier 0 (skill 0). At tier 1+, the engine targets
the **original word's** syllable count via `syllableCountFor(length)`:

| original word length | target syllables |
|----------------------|------------------|
| ≤ 2                  | 1                |
| 3–5                  | 2                |
| 6–8                  | 3                |
| 9+                   | `min(5, ceil(len/3))` |

So `wordLenWeights` shapes vocabulary "feel" only when a listener can't
detect the speaker's rhythm at all.

### `capitalize` *(optional, `"first" | "all" | "none"`, default `"first"`)*

| Value     | Behavior                                                           |
|-----------|--------------------------------------------------------------------|
| `"first"` | Mirror the original word's casing: `Hello` → `Krrog`, `hello` → `krrog`. |
| `"all"`   | Uppercase every fake. Useful for "shouty" languages (orcish).      |
| `"none"`  | Lowercase every fake. Useful for stylized languages.               |

### `accentSubs` *(optional, `Record<string, string>`)*

Substring substitutions applied to **pass-through** words at the
*passing* (26–60) and *proficient* (61–90) tiers. They simulate a
non-native accent in the listener's own language.

```json
"accentSubs": { "s": "sh", "th": "t", "f": "p" }
```

A speaker who's "speaking shyriiwook" but mid-skill listeners hear
`"the"` survive the pass-through roll — `accentSubs` then turns it
into `"te"`. Substitutions run in object-key insertion order; they're
applied left-to-right via `split`/`join`, so order matters when one
substitution feeds another.

### `description` *(optional, string)*

Shown in `+language/list`. Keep it under 80 chars for the table to
render nicely.

## A worked example: Orcish

Goal: short, percussive, ending in hard consonants, mostly 1–2
syllables, ALL CAPS.

```json
{
  "schema": 1,
  "name": "orcish",
  "mode": "phoneme",
  "description": "Guttural common-orcish — short, hard-edged, all caps.",
  "onsets": ["g", "gr", "k", "kr", "n", "r", "sh", "th", "z", "b"],
  "nuclei": ["a", "u", "o", "ar", "ur"],
  "codas": ["k", "g", "sh", "z", "rk", "gh"],
  "syllablePatterns": ["CVC", "CVC", "CV", "CCVC"],
  "wordLenWeights": [0, 3, 5, 1],
  "capitalize": "all",
  "accentSubs": { "th": "z", "f": "p", "v": "b" }
}
```

What this produces:

- Most words are 1–2 syllables; 3-syllable words exist but are rare.
- About 3/4 of syllables end with a coda — heavy consonant stops.
- `CCVC` (e.g. `KROK`) shows up occasionally; the rest of the time you
  get cleaner `CVC` (e.g. `GURK`, `THAZH`).
- At skill 30, pass-through words have `th` → `z`, so a player hears
  `"zis way!"` instead of `"this way!"`.

Drop this into your `languagesDir`, run `+language/reload`, and try:

```text
+language/learn me=orcish/0
+language/speak orcish
say Come with me, the dragon is dead.
```

## Testing your language

Before shipping a language, sanity-check the output:

```bash
deno run -A -e 'import { garble } from "./mod.ts"; \
  import { validateLangDef } from "./src/schema.ts"; \
  const def = JSON.parse(Deno.readTextFileSync("data/languages/orcish.json")); \
  const v = validateLangDef(def, "orcish.json"); \
  if (!v.ok) { console.error(v.errors); Deno.exit(1); } \
  for (const skill of [0, 15, 45, 75]) \
    console.log(skill, "→", garble("Come with me, the dragon is dead.", def, skill));'
```

Or just add the file and run `deno task showcase`.

## Anti-patterns

- **One-element `nuclei`.** Every vowel sound being identical reads as
  obviously-fake. Three is a comfortable minimum.
- **No `""` in `codas` and no `V`-only patterns.** Every syllable ends
  in a consonant; the language sounds choked. Add `""` to codas or a
  `"CV"` pattern.
- **`accentSubs` that swap common letters.** `{ "e": "i" }` will
  mangle every pass-through word almost beyond recognition. Stick to
  pairs that read as a real accent — `th → z`, `s → sh`, `r → l`.
- **A `wordLenWeights` of `[1, 1, 1, 1, 1, 1]`.** Uniform weights give
  you words ranging from 0 to 5 syllables in equal measure; the 0-case
  produces empty strings, and 5-syllable words look unnaturally long.
  Always set the 0-index to `0` and bias the middle.
