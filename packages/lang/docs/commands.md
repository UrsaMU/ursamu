# Command reference

In-game commands provided by the plugin. All are dispatched through
the single `+language` command, distinguished by `/switch`.

> Lock notation: `connected` = any logged-in player. `staff` = `admin`
> *or* `wizard` flag. `wizard` = the `wizard` flag specifically.

## `+language` (no switch)

**Lock:** connected
**Aliases:** `+lang`

Shows the caller's known languages, sorted by skill descending, plus
their currently-active language.

```text
> +language
=== Languages ===
Active: shyriiwook
  shyriiwook            80%
  huttese               30%
  sylvan                 5%
```

If the player knows no languages:

```text
=== Languages ===
You do not know any languages.
```

## `+language/speak <name>`

**Lock:** connected

Sets `<name>` as the active language for the caller. Subsequent `say`
and `pose` will be garbled-per-listener.

Validation:

- The caller must already *know* `<name>` (have an entry in
  `state.languages.known`). Otherwise: `You do not know <name>.`
- `<name>` must be configured (`getLang(name)`). Otherwise:
  `Language "<name>" is not configured.`

Success: `You are now speaking <name>.`

```text
> +language/speak shyriiwook
You are now speaking shyriiwook.
```

## `+language/clear`

**Lock:** connected

Equivalent to `+language/speak` with no argument. Removes
`state.languages.active`. After this, `say` and `pose` go back to
broadcasting clear text.

```text
> +language/clear
You are no longer speaking any language.
```

## `+language/list`

**Lock:** connected

Lists every language configured on this game, with its description.

```text
> +language/list
=== Languages === (configured)
  huttese       Slow, drawled trade language — open syllables, sibilants.
  shyriiwook    Wookiee speech — growling, throat-heavy syllables.
  sylvan        Sylvan elven — flowing liquids and long vowels.
```

If no languages are loaded: `No languages configured.`

## `+language/learn <player>=<lang>/<n>`

**Lock:** staff (admin or wizard)

Sets `<player>`'s skill in `<lang>` to `<n>` (clamped to 0–100). This
is how staff hand out language skills to PCs.

Argument grammar:

```
<player>=<lang>/<n>
```

- `<player>` is resolved with `u.util.target(u.me, name, true)` — same
  resolution as other staff commands. Must resolve to an object with
  the `player` flag.
- `<lang>` must be loaded; rejected otherwise.
- `<n>` is parsed as an integer and clamped via `clampSkill` to 0–100.

```text
> +language/learn Alice=huttese/75
Set Alice's huttese skill to 75.

> +language/learn me=shyriiwook/0
Set Wizard's shyriiwook skill to 0.   # known but no skill
```

Errors:

- `Permission denied.` — caller lacks admin/wizard.
- `Usage: +language/learn <player>=<language>/<0-100>` — malformed arg.
- `No such player: <name>` — target not found / not a player.
- `Unknown language: <lang>` — not in the store.

## `+language/reload`

**Lock:** wizard

Re-reads every `*.json` in the configured `languagesDir`, then re-bakes
the engine + new defs into `system/scripts/say.ts` and
`system/scripts/pose.ts`. No restart needed.

```text
> +language/reload
Loaded 4 language(s); re-baked say/pose scripts.
```

If the directory contains invalid files, errors are reported inline:

```text
Loaded 3 language(s); re-baked say/pose scripts.
Errors:
  badlang.json: schema must be 1
  badlang.json: invalid syllable pattern "CXV" (use C and V only)
```

## `say` and `pose` (overridden)

The plugin doesn't add new commands for `say` / `pose` / `:` / `;` /
`"` — it overrides them. Behavior summary:

| Command         | When active language is set                                              |
|-----------------|--------------------------------------------------------------------------|
| `say <msg>`     | Speaker hears `You say in <lang>, "<msg>"`; each listener hears the message garbled by their own skill. |
| `pose <msg>`    | Action text passes through. Quoted spans `"…"` are garbled per-listener. |
| `: <msg>`       | Alias of `pose`.                                                         |
| `; <msg>`       | Semipose alias of `pose` (no leading space between name and body).       |
| `" <msg>`       | Alias of `say`.                                                          |

When no active language is set, the overrides delegate to the same
broadcast they always would.
