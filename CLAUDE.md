# UrsaMU — Claude Code Instructions

## Project identity

TypeScript/Deno MUSH-like game server. Current version: **2.0.0** (full TinyMUX 2.x softcode engine).

- **Skill**: Always load `/ursamu-dev` before working on this codebase.
- **API reference**: `/Users/kumakun/.claude/skills/ursamu-dev/references/api-reference.md` is authoritative for every type, method, import path, and event payload. Read it before writing code. Never guess signatures.

---

## Commands

```bash
deno task test          # full suite — must stay green (1141 passed, 0 failed)
deno lint               # must be clean across all 348 files
deno task start         # run server
deno task dev           # dev mode with auto-restart
deno task test:coverage # coverage report
```

## Pre-commit checklist (mirrors CI — all must pass before every commit)

Run these in order before committing:

```bash
deno check --unstable-kv mod.ts                                    # type check
deno lint                                                           # lint
deno test tests/ --allow-all --unstable-kv --no-check              # unit tests
deno test tests/security_*.test.ts --allow-all --unstable-kv --no-check  # security tests
```

All four steps map directly to the CI jobs in `.github/workflows/ci.yml`. A commit is not ready if any step fails.

---

## Repo layout

```
src/commands/        Native addCmd registrations (Deno context, full APIs)
src/plugins/<name>/  Plugin directory — index.ts + commands.ts + help/ + README.md
src/services/        Core engine services (DB, Sandbox, cmdParser, etc.)
src/routes/          Express REST routes (core engine only)
src/@types/          TypeScript interfaces (IDBObj, IUrsamuSDK, ICmd, etc.)
system/scripts/      Sandbox scripts — one file per command, no Deno/net/fs APIs
tests/               Deno test files — always place new tests here
```

---

## Imports — use the right path

```typescript
// Inside src/ (native commands, plugins in src/plugins/)
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

// External plugins (outside the repo, consuming the package)
import { addCmd, DBO, gameHooks, registerPluginRoute } from "jsr:@ursamu/ursamu";
import type { ICmd, IPlugin, IDBObj, IUrsamuSDK } from "jsr:@ursamu/ursamu";
```

---

## addCmd skeleton

```typescript
addCmd({
  name: "+example",
  pattern: /^\+example(?:\/(\S+))?\s*(.*)/i,  // args[0]=switch, args[1]=rest
  lock: "connected",
  category: "General",
  help: `+example[/<switch>] <required> [<optional>]  — Brief description.

Switches:
  /switch   What this switch does.

Examples:
  +example Alice           Does the thing.
  +example/switch Alice    Does the other thing.`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    // ...
  },
});
```

### Pattern cheat-sheet

| Intent | Pattern | args |
|--------|---------|------|
| No args | `/^inventory$/i` | — |
| One arg | `/^look\s+(.*)/i` | `[0]` |
| Switch + arg | `/^\+cmd(?:\/(\S+))?\s*(.*)/i` | `[0]`=sw, `[1]`=rest |
| Two parts (=) | `/^@name\s+(.+)=(.+)/i` | `[0]`, `[1]` |

### Catch-all switch pattern — critical gotcha

When a command uses the catch-all switch pattern `/^\+cmd(?:\/(\S+))?\s*(.*)/i`,
**any more-specific `addCmd` registered for the same prefix will never match**.
The catch-all pattern consumes `+cmd/anything` before the engine reaches the
specific pattern.

```typescript
// WRONG — +cmd/sub addCmd is DEAD CODE; main +cmd handler matches first
addCmd({ name: "+cmd", pattern: /^\+cmd(?:\/(\S+))?\s*(.*)/i, exec: ... });
addCmd({ name: "+cmd/sub", pattern: /^\+cmd\/sub$/i, exec: ... }); // never reached

// CORRECT — handle sub-commands as switch branches inside the main exec
addCmd({
  name: "+cmd",
  pattern: /^\+cmd(?:\/(\S+))?\s*(.*)/i,
  exec: async (u) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    if (sw === "sub") { /* handle sub */ return; }
    // ...
  },
});
```

Only use separate `addCmd` registrations when the command prefixes are
**distinct** (e.g. `+jobs` vs `+job` — different command roots).

### Lock levels

| String | Who can use it |
|--------|----------------|
| `""` | Login screen (unauthenticated) |
| `"connected"` | Any logged-in player |
| `"connected builder+"` | Builder flag or higher |
| `"connected admin+"` | Admin flag or higher |
| `"connected wizard"` | Wizard only |

### Lockfunc system

Lock strings support callable functions: `funcname(arg1, arg2)` combined with
`&&`, `||`, `!`, and `()` grouping. Legacy `&` / `|` still work.

**Built-in lockfuncs**

| Lockfunc | Example | Passes when |
|----------|---------|-------------|
| `flag(name)` | `flag(wizard)` | enactor has the named flag |
| `attr(name)` | `attr(tribe)` | enactor.state has own-property `name` |
| `attr(name, val)` | `attr(tribe, glasswaler)` | enactor.state[name] === val |
| `type(name)` | `type(player)` | enactor has the type flag |
| `is(#id)` | `is(#5)` | enactor.id === "5" |
| `holds(#id)` | `holds(#12)` | enactor.contents includes #12 |
| `perm(level)` | `perm(admin)` | enactor passes privilege check |

**Registering a custom lockfunc (plugins)**

```typescript
import { registerLockFunc } from "jsr:@ursamu/ursamu";

registerLockFunc("tribe", (enactor, _target, args) =>
  String(enactor.state.tribe ?? "").toLowerCase() === args[0]?.toLowerCase()
);

// lock: "tribe(glasswaler)"
// lock: "attr(mortal) || !tribe(glasswaler)"
// lock: "connected && perm(builder)"
```

Built-in names (`flag`, `attr`, `type`, `is`, `holds`, `perm`) are protected
and cannot be overwritten. Locks are fail-closed: unknown func → false,
error → false. Max lock string: 4096 chars / 256 tokens.

---

## Key SDK idioms

```typescript
// Target resolution — always guard null
const target = await u.util.target(u.me, rawName, true); // true = global search
if (!target) { u.send("Not found."); return; }

// Display name (applies monikers)
u.util.displayName(target, u.me)

// Strip MUSH codes BEFORE DB ops or length checks (always)
const clean = u.util.stripSubs(u.cmd.args[0]).trim();

// DB writes — op must be "$set" | "$inc" | "$unset" only
await u.db.modify(target.id, "$set",  { "data.gold": 100 });
await u.db.modify(target.id, "$inc",  { "data.score": 1 });
await u.db.modify(target.id, "$unset",{ "data.tempFlag": "" });

// Permission check (Promise<boolean>)
if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

// Admin check
const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

// Send to another player
u.send("Message for target.", target.id);
```

---

## MUSH color codes

| Code | Effect | Code | Effect |
|------|--------|------|--------|
| `%ch` | Bold | `%cn` | Reset (always close with this) |
| `%cr` | Red | `%cg` | Green |
| `%cb` | Blue | `%cy` | Yellow |
| `%cw` | White | `%cc` | Cyan |
| `%r`  | Newline | `%t` | Tab |

Use `u.util.center(title, 78, "=")` for section headers.

---

## Escaping `[` and `]` in softcode attributes

Square brackets are reserved by the TinyMUX evaluator as function-call
delimiters (`[func(args)]`). Storing literal `[` or `]` inside an attribute
value will be parsed as a function call and either error or produce surprising
output. To embed literal brackets, use `lit([)` / `lit(])`, or `chr(91)` /
`chr(93)`, or pick a different delimiter such as `<>` or `<<…>>`. This bites
format-attr authors most often (`NAMEFORMAT`, `DESCFORMAT`, row templates) —
write `<<%0>>` or `ROW(%0)` rather than `[%0]` when the brackets must appear
in output.

**Plugin slot names**: `FormatSlot` is an open union — plugin authors can pass
any `"UPPERCASE"` slot name (e.g. `"MAILFORMAT"`, `"BBROWFORMAT"`,
`"CHANNELLISTFORMAT"`) directly to `registerFormatHandler` / `resolveFormat` /
`resolveGlobalFormat` without `as FormatSlot` casts. The eight engine-known
literals (NAMEFORMAT, DESCFORMAT, CONFORMAT, EXITFORMAT, WHOFORMAT,
WHOROWFORMAT, PSFORMAT, PSROWFORMAT) still get IDE autocomplete.

---

## Help file standards (non-negotiable)

Help files live in `src/plugins/<name>/help/*.md` and are served in-game by the help-plugin FileProvider.

### Width and length

- **Maximum line width: 78 characters.** Every line of help text — headers, body, examples — must fit within 78 printable characters. Use `u.util.center(title, 78, "=")` for section headers.
- **Maximum page length: 22 lines of content** (one terminal screen at 24 lines, leaving room for the prompt). Count blank lines. If a topic needs more space, split it.

### Splitting long topics

When a topic exceeds 22 lines, split into sub-files. Place sub-files in a **subdirectory** named after the topic so they form their own section and stay out of the main help index:

```
help/
├── widget.md            ← overview + quick-ref (≤22 lines); section = "general"
└── widget/
    ├── syntax.md        ← full syntax reference; section = "widget"
    └── examples.md      ← extended examples;    section = "widget"
```

The overview file must end with a `SEE ALSO` line:

```
SEE ALSO: +help widget/syntax, +help widget/examples
```

Every sub-file should start with a one-line back-reference:

```
See also: +help widget (overview)
```

> **Why subdirectory?** The FileProvider exposes every `.md` file in the help listing. Keeping sub-files in a named subdirectory groups them under their own section (e.g., `widget`) instead of flooding the main index alongside top-level topics.

### File format

```
+TOPIC-NAME

One-sentence description of what **+topic-name** does; use `value` for examples.

SYNTAX
  +command[/switch] <required> [<optional>]

SWITCHES
  /switch    What this switch does.

EXAMPLES
  +command foo       Does the thing.
  +command/switch x  Does the other thing.

SEE ALSO: +help related-topic
```

- Title is `+TOPIC-NAME` ALL CAPS, flush left — no decorative border lines.
- Section labels (`SYNTAX`, `SWITCHES`, `EXAMPLES`, `SEE ALSO`) are ALL CAPS, flush left.
- Body text is indented 2 spaces.
- Exactly 1 blank line between sections.
- No line may exceed 78 characters — wrap prose at word boundaries.

### Markdown in body text

Help files are rendered as markdown — use subtle formatting that looks good on the
web and degrades to terminal color decoration via the MUSH renderer:

- `**bold**` → `%ch` — use for key terms, command names, important values.
- `` `backtick` `` → `%ch%cg` — use for inline code, slugs, paths, exact-match strings.
- Keep it subtle: one or two highlights per paragraph, not every noun.
- **Do not use** `_italic_` (terminal rendering is lost), `### headings` inside body
  text (use ALL CAPS section labels instead), HTML, or tables.

### Audit checklist additions

Add to the existing audit checklist:
- [ ] Every help file ≤ 22 content lines
- [ ] Every help file line ≤ 78 characters
- [ ] Multi-page topics linked with `SEE ALSO:`
- [ ] Sub-files open with a back-reference to the parent topic
- [ ] Help file body uses subtle markdown (bold for key terms, backticks for values) — no headings, no HTML

---

## Plugin architecture (three phases — non-negotiable)

```
Phase 1 — module load   import "./commands.ts" → addCmd() fires at load time (NOT in init)
Phase 2 — init()        wire gameHooks listeners, registerPluginRoute, seed data → return true
Phase 3 — remove()      gameHooks.off() for every .on() using the SAME named function reference
```

```typescript
// index.ts
import "./commands.ts";                          // Phase 1
import { gameHooks } from "jsr:@ursamu/ursamu";
import type { IPlugin, SessionEvent } from "jsr:@ursamu/ursamu";

const onLogin = (e: SessionEvent) => { /* ... */ };  // named ref — required for remove()

export const plugin: IPlugin = {
  name: "myplugin",
  version: "1.0.0",
  description: "One sentence.",
  init:   () => { gameHooks.on("player:login", onLogin); return true; },  // must return true
  remove: () => { gameHooks.off("player:login", onLogin); },
};
```

**DBO namespace rule**: always prefix with `<pluginName>.`:

```typescript
const records = new DBO<IRecord>("myplugin.records");  // correct
const records = new DBO<IRecord>("records");            // wrong — collides
```

---

## Test patterns

### Required boilerplate

```typescript
// All tests that import service layer need this (CmdParser triggers async file reads)
const OPTS = { sanitizeResources: false, sanitizeOps: false };
Deno.test("description", OPTS, async () => { /* ... */ });
```

### mockPlayer / mockU helpers

Define at top of test file (or import from `tests/helpers/mockU.ts` if it exists):

```typescript
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "test_actor1",                  // prefix IDs to avoid collision
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester" },
    location: "test_room1",
    contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: IDBObj | null;
  canEditResult?: boolean;
} = {}) {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  return Object.assign({
    me: mockPlayer(opts.me ?? {}),
    here: {
      id: "test_room1", name: "Room",
      flags: new Set(["room"]), state: {}, location: "", contents: [],
      broadcast: (m: string) => { /* captured elsewhere if needed */ },
    },
    cmd: { name: "", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => opts.canEditResult ?? true,
    db: {
      modify: async (...a: unknown[]) => { dbCalls.push(a); },
      search: async () => [],
      create: async (d: unknown) => ({ ...(d as object), id: "99", flags: new Set(), contents: [] }),
      destroy: async () => {},
    },
    util: {
      target: async () => opts.targetResult ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls });
}
```

### DB query quirks

- `dbojs.queryOne()` returns `IDBOBJ | undefined | false` — cast with `as any` in tests when needed
- Close DB in the last test of a file: `await DBO.close()`

### Required test cases for every command

- Happy path — correct output and DB call
- Null target — graceful not-found message, no DB write
- Permission denied — `canEdit` false, no DB write
- DB op is `$set`/`$inc`/`$unset` (assert exact args)
- Admin guard — non-admin rejected (if admin command)
- `stripSubs` called before DB (MUSH codes stripped)

---

## Code style (non-negotiable)

- **Early return** over nested conditions
- **No function longer than 50 lines** — decompose
- **No file longer than 200 lines** — split
- **No bare `catch`** — always `catch (e: unknown)`
- **Library-first** — if the SDK does it, use the SDK
- **No deep nesting** — max 3 levels
- **No comments** unless the WHY is non-obvious (hidden invariant, workaround for a specific bug)

---

## Audit checklist (run mentally before every PR)

- [ ] `u.util.stripSubs()` on all user strings before DB ops or length checks
- [ ] `await u.canEdit(u.me, target)` before modifying any object not owned by `u.me`
- [ ] All DB writes use `"$set"` / `"$inc"` / `"$unset"` — never raw object overwrite
- [ ] `u.util.target()` result null-checked before use
- [ ] Admin-only actions check `u.me.flags` explicitly
- [ ] `system/scripts/` files use no Deno APIs, no `fetch`, no non-`u` globals
- [ ] All `%c*` color codes closed with `%cn`
- [ ] Every `addCmd` has `help:` with syntax line + Switches section (if switches) + ≥2 examples
- [ ] `gameHooks.on()` in `init()` paired with `gameHooks.off()` in `remove()` — same named reference
- [ ] DBO collection names prefixed with `<pluginName>.`
- [ ] REST route handlers return 401 before any work when `userId` is null
- [ ] `init()` returns `true`
- [ ] Custom lockfuncs registered via `registerLockFunc` — never overwrite built-in names

---

## PRs and commits

- No Claude/AI attribution in PR titles, commit messages, or code comments.
- Use squash-merge for feature PRs.
- Tag versions after squash-merge: `git tag v<version> && git push --tags`.

---

## Softcode / system scripts

Scripts in `system/scripts/` run inside the Web Worker sandbox. Rules:
- No `Deno.*`, no `fetch`, no `import` (unless ESM-style export default)
- ESM style preferred: `export default async (u: IUrsamuSDK) => { ... }`
- `export const aliases = ["alt-name"]` for command aliases
- `u.util.stripSubs(str)` — strips `%cX`, `%n/%r/%t/%b/%R`, and raw ANSI escapes

### wrapScript pattern (tests only)

```typescript
// For system scripts in tests — strips imports/exports, runs as legacy block
// For UI-emitting scripts, see tests/scripts_comms.test.ts for the extended pattern
// that captures _sent, _broadcast, and stubs u.ui.layout
```
