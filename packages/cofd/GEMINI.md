# GEMINI.md — Chronicles of Darkness (CoFD) Plugin

UrsaMU plugin for Chronicles of Darkness 2e. Sheets, chargen, dice.

## Setup

```bash
npx @lhi/ursamu-dev         # install the dev skill
ursamu-dev --install-hooks  # block commits that fail the audit
```

Activate in Gemini / Antigravity: `/ursamu-dev`. The skill enforces a six-stage
pipeline (Design → Generate → Audit → Refine → Test → Docs) and knows every
import path, SDK method, lock level, and security pattern. Use it for every
feature — no exceptions.

---

## Commands

```bash
deno task test                       # full suite — must stay green
deno lint                            # must be clean
deno check index.ts                  # plugin loads cleanly
bash ~/.gemini/skills/skills/ursamu-dev/hooks/advance-stage.sh --confirm-design
bash ~/.gemini/skills/skills/ursamu-dev/hooks/advance-stage.sh --pass-audit
```

---

## Six-stage workflow

1. **Stage 0 — Design.** Research rules, choose command regex, draft
   invariants, publish AAAK Design Plan, get user confirmation, run
   `--confirm-design`.
2. **Stage 1 — Generate.** Write code per the confirmed plan using v2.x
   patterns under `src/<semantic>/`.
3. **Stage 2 — Audit.** Run the 18-point checklist below.
4. **Stage 3 — Refine.** Remediate audit findings, run `--pass-audit`.
5. **Stage 4 — Test.** `deno task test` plus `/tdd-audit` exploit cycles.
6. **Stage 5 — Docs.** Update `help/*.md` topic files and `README.md`.

---

## Structure

```
ursamu-cofd-plugin/
├── index.ts              IPlugin — init(), remove(), imports commands.ts
├── commands.ts           Thin shim — side-effect imports src/commands/register.ts
├── cofd.ts, cg.ts,       Thin re-export shims for test backward-compat
│   templates.ts
├── routes.ts             REST handler for /api/v1/cofd
├── src/
│   ├── dictionary/       Typed re-exports of resources/*.json
│   ├── support/          format helpers, prereq evaluator
│   ├── stats/            CofdSheet model, validate, setter
│   ├── roller/           parse, execute
│   ├── sheet/            render orchestrator + sections/ composable blocks
│   ├── chargen/          state, instructions, validate
│   ├── gamelines/        templates loader (one JSON per template)
│   └── commands/         sheet/roll/chargen + register.ts (addCmd side effects)
├── resources/            attributes.json, skills.json, merits.json
├── templates/            mortal/vampire/werewolf/mage/changeling JSON
├── help/                 per-command topic files (cofd, cg, sheet, roll)
├── docs/                 design specs (vampire overlay, conditions, xp/beats)
├── tests/                Deno unit tests
├── showcases/            in-process command demos
├── deno.json             tasks + import map
└── ursamu.plugin.json    plugin manifest (declared deps, version)
```

---

## Import paths

```typescript
import { addCmd, DBO, gameHooks, registerPluginRoute } from "@ursamu/ursamu";
import type { IPlugin, IUrsamuSDK, IDBObj, SessionEvent } from "@ursamu/ursamu";
import { registerHelpDir } from "@ursamu/help-plugin";
```

The `@ursamu/help-plugin` alias resolves to a raw GitHub URL in `deno.json`
because the package is not on JSR yet.

---

## addCmd skeleton

```typescript
addCmd({
  name: "+cofd-cmd",
  pattern: /^\+cofd\-cmd(?:\/(\S+))?\s*(.*)/i,  // args[0]=switch, args[1]=rest
  lock: "connected",
  category: "Cofd",
  help: `+cofd-cmd[/switch] <arg>  — Description.

Examples:
  +cofd-cmd foo    Does the thing.`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();  // strip codes FIRST
  },
});
```

---

## Plugin lifecycle (index.ts)

```typescript
import "./commands.ts";  // Phase 1 — addCmd() fires here, NOT in init()

const onLogin = (e: SessionEvent) => { /* named ref — required for remove() */ };

export const plugin: IPlugin = {
  name: "cofd",
  version: "1.0.0",
  description: "One sentence.",
  dependencies: [{ name: "help", version: ">=1.0.0" }],
  init:   () => { gameHooks.on("player:login", onLogin); return true; },
  remove: () => { gameHooks.off("player:login", onLogin); },  // same ref
};

export default plugin;
```

Rules:
- `addCmd()` **never inside `init()`** — must fire at module load.
- `init()` must return `true`. Returning `false` disables the plugin.
- Every `.on()` needs a matching `.off()` using the **same named function**.
- The plugin object is exported as **both** `export const plugin` and
  `export default plugin` so both old and new loaders find it.

---

## Key SDK calls

```typescript
const target = await u.util.target(u.me, arg, true);  // true = global search
if (!target) { u.send("Not found."); return; }

if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

await u.db.modify(target.id, "$set",  { "data.field": value });
await u.db.modify(target.id, "$inc",  { "data.score": 1 });
await u.db.modify(target.id, "$unset",{ "data.tmp": "" });

u.send("Message.", target.id);  // optional second arg = recipient socket id
```

---

## Player-inline state pattern

The SDK surfaces stored `data.*` fields as `state.*` on the live object.
**Reads** use `u.me.state.cofd`; **writes** target `"data.cofd"`. Mixing
them (writing to `"state.cofd"`) silently fails to persist -- the next
read re-hydrates from `data.*` and the write is lost.

```typescript
// Reading (always default)
const ps = (u.me.state.cofd ?? {}) as CofdSheet;

// Writing (always spread to preserve other fields)
await u.db.modify(u.me.id, "$set", { "data.cofd": { ...ps, field: value } });
```

Use `data.cofd` for the per-player sheet, `data.cofd_cg` for the chargen
workspace, and `data.cofd_<scoped>` for any other per-player transient
state. Use `new DBO("cofd.<collection>")` for records with their own
lifecycle (combat encounters, NPC directory, scene logs, etc.).

---

## Code conventions

- **Imports.** Use the `@ursamu/ursamu` alias from `deno.json` (not raw
  `jsr:` URLs). Workers / system scripts use the injected `u` SDK object —
  never import the package directly.
- **Permissions.** Guard every cross-player edit with
  `await u.canEdit(u.me, target)`. Use `isAdmin` for restricted ops.
- **DB writes.** `u.db.modify(id, op, data)` with op exactly `"$set"`,
  `"$unset"`, or `"$inc"`. No raw overwrites.
- **Color codes.** Every `%c*` opens a code; every `%cn` closes. Never leave
  open codes; they leak into subsequent output lines.
- **No emojis** in any file (code, help, docs, commit messages).
- **Latin-1 only (U+0000..U+00FF).** No em-dashes (U+2014), bullets (U+2022),
  arrows (U+2192), ellipses, smart quotes, or other non-Latin-1 glyphs in
  source, JSON catalogs, help text, showcases, or docs. The MUSH terminal
  is single-byte; multi-byte glyphs render as garbage. Use ASCII fallbacks:
  `--` for em-dash, `*` or `.` for bullet, `->` for arrow, `...` for
  ellipsis, plain `'` `"` for quotes.

---

## Help file format

`help/*.md` files render through a MUSH client, not a documentation site.
Use plain-text only — markdown decorations (`#` headers, ` ``` ` fences,
markdown tables) appear literally to the player and look broken.

Mirror the inline `help:` text from `addCmd`. Each topic file has:

```
+cmd  -- One-sentence purpose. Wrap at ~78 columns.

Syntax:
  +cmd <required-arg>            One-line description.
  +cmd/switch [<optional-arg>]   What the switch does.

Switches:
  /switch     What it does.
  /other      What it does.

Permissions:
  View           connected.
  Edit own       connected.
  Edit other     connected + canEdit (builder+).

Mechanics:        (optional, only when rules need explanation)
  Plain text rules paragraph.
  Plain text table:
    Column One       Column Two
    -------------    -----------
    value            value

Examples:
  +cmd arg                    Comment.
  +cmd/switch arg             Comment.

See also: topic, topic, topic
```

Rules:
- No `#` / `##` headers. Section labels end in `:` and are flush-left.
- No code fences. Indent example/syntax blocks two spaces.
- No markdown tables. Use aligned plain text with dashed separators.
- No bullet `-` markers in body text. Use indented lines or short rows.
- No emojis.
- One blank line between sections.
- The first line is `+cmd  --` followed by the one-sentence purpose. This
  matches the first line of the inline `help:` text in the addCmd block,
  so the two stay in sync.
- **Length target ~40 lines (one MUSH screen).** Long sections and
  reference tables move into sub-topic files under `help/<cmd>/`:
  - `help/vitae.md`               — top-level (`help vitae`)
  - `help/vitae/blood-potency.md` — sub-topic (`help vitae blood-potency`)
  - `help/vitae/costs.md`         — sub-topic (`help vitae costs`)
- **Sub-topic filenames must name what's inside**, not the generic
  "mechanics" or "details." For example: `roll/successes.md`,
  `health/wounds.md`, `condition/tilts.md`, `touchstone/humanity.md`.
  Generic names collide visually and don't help the player skim a
  `help <cmd>` Topics list.
- The top-level file lists its sub-topics in a `More:` block above
  `See also:`. The help-plugin's textdir loader scans subdirectories
  recursively, so any nested file is reachable as `help <cmd> <sub>`.

---

## Output layout convention

Two distinct output shapes, picked by intent:

```
Pages (full character views)  -> header() + body + footer()
Panels (list/status views)    -> divider("TITLE") + body, no closing rule
Single broadcasts             -> no layout helpers
```

- **Pages** are full-screen, "this is the document" views: `+sheet`, `+cg`.
  They close the frame with `footer()` so the player gets a clear visual
  end to the document.
- **Panels** are list or status read-outs that the player consults in
  passing: `+combat`, `+gear/list`, `+condition`, `+xp`, `+npc/list`,
  `+tilt`, `+health`, `+aspiration`. They open with `divider("TITLE")` and
  let the next prompt close them -- no footer.
- **Single broadcasts** are one-shot lines (a roll result, an error, an
  ack) and use no layout helpers at all.
- All three obey the 78-column width. Any hand-rolled rule must match the
  SDK's 78-char default (`"-".repeat(78)`) -- never 72, never 76. No
  em-dashes, smart quotes, bullets, or other non-Latin-1 glyphs in titles
  or rules.
- Panel titles are ALL-CAPS-WITH-SPACES (e.g., `"C O M B A T"`,
  `"C O N D I T I O N S"`) to match the existing style.

---

## Test boilerplate

```typescript
const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("happy path", OPTS, async () => { /* ... */ });
// Required: happy path · null target · perm denied · correct DB op · admin guard · stripSubs
```

Write pure engine/ function tests first — no mocks, catches the most
regressions. Add a `tests/security/` directory for exploit→fix tests; one
file per bug found.

---

## Showcase — executes real commands in-process

```bash
deno task showcase           # interactive menu
deno task showcase --list    # list available showcases
deno task showcase <key>     # run one
```

The runner imports `commands.ts` (firing `addCmd()`), matches each step's
`cmd` string against the live registry, and calls `cmd.exec(u)` against a
mock SDK. The output is the actual command output, not a documentation
render.

Step types:

```json
{ "sub":    "Heading" }
{ "note":   "Narrative — not executed." }
{ "cmd":    "+sheet", "label": "comment", "as": "admin" }
{ "expect": "substring that must appear in the previous cmd output" }
{ "reset":  true }
```

`reset` clears the in-memory DBO store between scenarios.

---

## Audit checklist (Stage 2)

- [ ] `u.util.stripSubs()` on all user strings before DB ops or length checks
- [ ] `await u.canEdit()` before modifying any object not owned by `u.me`
- [ ] DB writes use `"$set"` / `"$inc"` / `"$unset"` — never raw overwrite
- [ ] `u.util.target()` null-checked before use
- [ ] All `%c*` color codes closed with `%cn`
- [ ] `gameHooks.on()` in `init()` paired with `gameHooks.off()` in `remove()` (same ref)
- [ ] DBO collection prefixed: `"cofd.<collection>"`
- [ ] REST route returns 401 before any work when `userId` is null
- [ ] `init()` returns `true`
- [ ] Every `addCmd` has `help:` with syntax line + examples
- [ ] No emojis in source, help, or docs
- [ ] All characters are Latin-1 (U+0000..U+00FF) -- no em-dashes, bullets, arrows, smart quotes

---

## Chronicles of Darkness 2e — game-rule reference

### Stats and traits

- **Mental attributes**: Intelligence, Wits, Resolve.
- **Physical attributes**: Strength, Dexterity, Stamina.
- **Social attributes**: Presence, Manipulation, Composure.
- **Mental skills**: Academics, Computer, Crafts, Investigation, Medicine,
  Occult, Politics, Science.
- **Physical skills**: Athletics, Brawl, Drive, Firearms, Larceny, Stealth,
  Survival, Weaponry.
- **Social skills**: Animal Ken, Empathy, Expression, Intimidation,
  Persuasion, Socialize, Streetwise, Subterfuge.
- **Untrained penalties**: -3 on Mental skills, -1 on Physical/Social.

### Roll mechanics

- **Pool** = Attribute + Skill + Modifiers (d10s).
- **Success** = 8, 9, or 10.
- **10-again (default)** — 10 counts AND rerolls; chains.
- **9-again / 8-again** — lower the reroll threshold.
- **Rote** — reroll every initial failure (1-7) once. Rerolls obey n-again
  but do not themselves rote.
- **Exceptional** — 5+ successes; trigger Inspired (or template equivalent).
- **Chance die** — pool ≤ 0 rolls one d10. Success only on 10. A 1 is a
  Dramatic Failure. Chance dice ignore rote/9-again/8-again.

### Command invariants

- `+sheet [<player>]` — connected.
- `+sheet/set <trait>=<value>` — connected; canEdit guard for cross-player.
- `+sheet/set specialty/<skill>=<name>` — same gate.
- `+cg`, `+cg/set`, `+cg/back`, `+cg/reset`, `+cg/submit` — connected;
  self only.
- `+roll[/wp][/rote][/9again|/8again] <expression>` — connected.

---

## Full API reference

`~/.gemini/skills/ursamu-dev/references/api-reference.md` — every type,
SDK method, event payload, and lock expression. Read it before writing
any code.

Activate the full dev skill with `/ursamu-dev`.
