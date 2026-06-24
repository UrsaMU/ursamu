# Installation

## Prerequisites

- **Deno 1.45+** (uses `--unstable-kv` for the test task).
- A working **UrsaMU** game directory.

```bash
deno --version
# deno 1.45.0 (or newer)
```

## 1. Add the package

From your UrsaMU game root:

```bash
deno add @lhi/sgp-language-plugin
```

This adds the entry to your `deno.json` `imports`. The first time you
import from it, Deno will fetch and cache the package from JSR.

For local development, clone the repo into your game's plugin tree
instead:

```bash
git clone <repo-url> plugins/sgp-language-plugin
```

…and import via the relative path.

## 2. Register the plugin

Add it to wherever your game collects plugins (commonly
`system/plugins.ts` or a `plugins` array in your bootstrap file):

```ts
import sgpLanguage from "@lhi/sgp-language-plugin";

export const plugins = [
  // … existing plugins
  sgpLanguage,
];
```

If you want a non-default languages directory, set it *before* the
host calls `init`:

```ts
import sgpLanguage from "@lhi/sgp-language-plugin";
sgpLanguage.config = { languagesDir: "data/my-languages" };
```

Relative paths resolve from `Deno.cwd()`; absolute paths are used
as-is.

## 3. First boot

Start your game. You should see:

```
[sgp-language] Loaded 3 language(s) from /…/data/languages.
[sgp-language] Installed say.ts override.
[sgp-language] Installed pose.ts override.
```

What just happened:

1. The plugin created `data/languages/` if it was missing.
2. Because the directory was empty, it copied the bundled samples
   (`huttese.json`, `shyriiwook.json`, `sylvan.json`) into it.
3. It loaded those three files.
4. It baked the garble engine and the loaded defs into
   `system/scripts/say.ts` and `system/scripts/pose.ts`, after backing
   up the originals to `*.original.ts`.

## 4. Smoke test in-game

```text
+language/list
@wizard +language/learn me=shyriiwook/100
+language/speak shyriiwook
say Hello, friend.
```

You should see `You say in shyriiwook, "Hello, friend."`. Another
connected character in the same room — without any shyriiwook skill —
will see a garbled version.

## 5. Verify the overrides

```bash
head -3 system/scripts/say.ts
# Should start with the inlined banner:
#   // ─── sgp-language inlined garble engine (do not edit; …) ───
```

`system/scripts/say.original.ts` should now exist as a backup of
whatever was there before.

## Removal

```ts
// Stop registering the plugin
export const plugins = [
  // sgpLanguage,   <- remove
];
```

On a clean shutdown that calls `plugin.remove()`, the original
`say.ts` / `pose.ts` are restored from `*.original.ts`. If you simply
stop loading the plugin without an orderly remove, the *baked* scripts
keep working — they're self-contained.

To clear the override manually:

```bash
mv system/scripts/say.original.ts  system/scripts/say.ts
mv system/scripts/pose.original.ts system/scripts/pose.ts
```

## Source-control

The override files are generated. Either:

- **Commit them as build output** when you ship a tagged plugin
  version, or
- **Gitignore them** so your repo always reflects "stock" UrsaMU:

  ```gitignore
  system/scripts/say.ts
  system/scripts/pose.ts
  system/scripts/say.original.ts
  system/scripts/pose.original.ts
  ```

Whichever you pick, be consistent.
