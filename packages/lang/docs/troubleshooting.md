# Troubleshooting

## Boot

### `[sgp-language] init failed: ...`

The plugin caught an exception during init. Common causes:

- **Working directory is wrong.** The plugin resolves `languagesDir`
  from `Deno.cwd()`. Run your game from the game root, not from a
  subdirectory.
- **No write permission on `system/scripts/`.** The plugin needs to
  write baked overrides there. Check the directory exists and the
  process can write to it.
- **A malformed JSON file in `languagesDir`.** Validation errors don't
  fail init by themselves — they're logged. But a directory that can't
  be read at all will.

### `[sgp-language] Failed to install say.ts: …`

`installScripts` couldn't write. Check:

```bash
ls -la system/scripts/
```

If `system/scripts/` doesn't exist, you're not in the game root.

### `[sgp-language] Errors:` on boot or reload

Each line is `<file>: <validator message>`. The file is still skipped,
the others still load. Fix the file and run `+language/reload`.

## In-game

### `+speak` works but `say` looks unchanged

You should see `You say in <language>, "..."` on your own
output when a language is active. If you still see the stock
`Name says, "..."` line, the language plugin did not replace
the stock say/pose commands.

1. Confirm boot log has `[sgp-language] Loaded N language(s)`.
2. Restart the game after enabling the plugin so `init()` runs
   `installSpeechCmds()`.
3. Check you actually have skill > 0 (or a CofD Language
   merit) — `+speak` refuses unknown languages.

**Note:** You always hear your own words clearly. Garbling is
per-listener. Have a second character with 0 skill in the room
to hear garbled text. Skill 100 listeners hear clear speech.

### `Your active language "x" is not configured here.`

The language was set as active for the player, but the def isn't
loaded. Either the file is missing from `languagesDir`, has a
validation error, or wasn't reloaded after you added it.

```text
+language/list                 # what's actually loaded?
+language/reload               # if you just added a file
```

### `+language/learn` says `Permission denied.`

The caller needs the `admin` or `wizard` flag. `+language/reload`
requires `wizard` specifically.

### Garbled output is identical for two listeners

This is correct. The seed is `(word, langName, skillBucket)` — listener
identity is *not* part of it. Two listeners in the same tier see the
same string. If you want them to differ, change one of their skills
enough to cross a tier boundary (0/1/26/61/91).

### A skill-100 listener still sees garble

`tierFor(100)` returns bucket 4 with `passThrough = 1.0`, and `garble`
short-circuits with the original text. If you see garble at skill 100,
check:

- That `+language/learn` actually applied. `+language` (no switch) on
  the listener should show the skill.
- That the listener is connected (`flags.has("connected")`). The
  override only iterates connected objects.
- That you're looking at the *listener's* side. The speaker always
  sees their own line clearly regardless of skill.

### Pose action text is being garbled

It shouldn't be. The pose override only garbles spans inside `"…"`. If
your action text contains stray double-quotes (e.g. nested quotes), the
splitter might catch them. Use single quotes or escape carefully.

### `+language/reload` runs but a new file isn't picked up

Two possibilities:

- The file has a validation error and was rejected. Check the error
  list in the reload's output.
- The file isn't actually in the configured `languagesDir`. Run a
  player-side `+language/list` and verify your file's `name` appears.

### Override is gone after a deploy

If your deploy process rsyncs/copies `system/scripts/` from a clean
source, the override gets overwritten. Either:

- Run `+language/reload` after the deploy to re-bake, or
- Re-trigger plugin `init` (full restart), or
- Gitignore the baked files and let the plugin produce them on every
  start.

## Engine / development

### `deno task test` fails on `--unstable-kv`

Your Deno is too old. Upgrade:

```bash
deno upgrade
```

### `deno task check` complains about `@types/UrsamuSDK`

The override scripts import via `../../@types/UrsamuSDK.ts` — that path
is relative to where they'll be *installed* (`system/scripts/`), not
where they live in the plugin (`scripts/`). The plugin's `check` task
deliberately checks `index.ts` and `mod.ts` only, not the override
templates.

### Bake produced unexpected output

`stripModuleSyntax` is a regex-based stripper. It handles:

- `import … ;` on its own line.
- `export function`, `export const`, `export let`, `export var`,
  `export interface`, `export type`, `export enum`, `export class`
  prefixes.
- `export { … };` re-exports.

It does **not** handle:

- Default exports.
- `export *` re-exports.
- Multi-line imports.

If you add a new module to `SRC_FILES` in `src/inline.ts`, keep it to
the patterns above.
