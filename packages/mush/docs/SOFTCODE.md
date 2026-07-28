# Softcode support (engine)

UrsaMU embeds a TinyMUX-oriented evaluator (`softcodeEngine`) and a
Web Worker sandbox for scripts. This is **not** a certified full
TinyMUX 2.12 clone.

## Stable entrypoints (1.0)

| API | Role |
|-----|------|
| `runSoftcode` / `runSoftcodeSimple` | Evaluate mushcode strings |
| `softcodeEngine` | Lower-level engine access |
| `register` / `lookup` / `entries` | Function registry |
| `registerSub` / `lookupSub` | Substitution hooks |
| `sandboxService` / `registerScript` | Worker scripts by name |

## Layout softcode

Config `game.layout.header|divider|footer` uses a **safe subset**
of functions (center, ljust, if, words, …). See README layout
section. Full evaluator functions are not all available there.

## Known gaps / non-goals

- Not every TinyMUX function or side effect is implemented
- Channel/building economy and channel objects live in plugins
- Sandbox has no Deno/net/fs; only the injected `u` SDK
- Top-level `import` in sandbox scripts is stripped at compile
- Prefer `chr(91)` / `chr(93)` or `lit(...)` carefully for
  literal brackets (raw `[` / `]` are parser delimiters)

## Policy (after 1.0)

| Change | Bump |
|--------|------|
| New softcode functions | **minor** |
| Remove or change return semantics of documented stdlib | **major** |
| Layout subset: additive functions | **minor** |
| Layout subset: remove a documented function | **major** |

Smoke coverage lives in `tests/softcode_smoke.test.ts`.
