---
layout: layout.vto
title: Writing Help Files
description: How to create and organize in-game help files for UrsaMU players using the help-plugin.
---

# Writing Help Files

The `help` command is provided by the **[help-plugin](https://github.com/UrsaMU/help-plugin)**, which
is bundled in the default `plugins.manifest.json` and installed automatically on first run. It replaces
the former built-in help command.

The plugin reads Markdown (`.md`) and plain text (`.txt`) files from the `help/` directory, merges
them with any DB-stored entries and inline command help, then renders everything with MUSH color codes
word-wrapped to 78 characters.
---

## Overview

```
help/
├── mail/
│   ├── index.md       ← shown for "help mail"
│   ├── send.md        ← shown for "help mail/send" or "help send"
│   └── reply.md
├── building/
│   ├── @dig.md        ← shown for "help dig" (@ stripped from lookup)
│   └── @lock.md
└── _admin/
    └── reboot.md      ← shown for "help reboot"
```
---

## Directory Structure

Each subdirectory of `help/` becomes a **category** listed on the help index.
Players can type `help <category>` to see all topics in that category.

```
help/
  social/     ← "help social" lists subtopics
  building/   ← "help building" lists subtopics
  mail/       ← "help mail" shows index.md + subtopics
  info/
  comsys/
  chargen/
  _admin/     ← visible category, underscore is cosmetic only
```

### Category index file

If a directory contains `index.md` (or `readme.md`), that file's content is
shown when a player types `help <category>`. Topics in the directory are
listed automatically below it as sub-topics.

```
help/mail/index.md  →  shown for "help mail"
```

You don't need to manually list subtopics — they appear automatically.
---

## File Naming

### Basic names

Any `.md` or `.txt` file in `help/` or a subdirectory becomes a help topic.
The filename (without extension) is the topic name.

```
help/social/say.md      →  "help say"  or  "help social/say"
help/building/link.md   →  "help link" or  "help building/link"
```

### `@` prefix

Files named `@command.md` are accessible as both `help @command` and
`help command` — the `@` is stripped automatically. Use this for commands
whose in-game name starts with `@`.

```
help/building/@dig.md   →  "help dig"  or  "help @dig"
help/building/@lock.md  →  "help lock" or  "help @lock"
```

### `help_` and `topic_` prefixes

These prefixes are also stripped. `help_say.md` is the same as `say.md`.
Prefer bare names — the prefixes exist for legacy compatibility only.

### Global vs. scoped lookup

When a player types `help send`, the system finds the first matching file
anywhere in the hierarchy. To force a scoped lookup they type `help mail/send`.
If two files in different categories share a name, only the first match is
returned — use scoped paths to avoid ambiguity.
---

## Markdown Support

Help files are valid Markdown. The following elements are rendered with MUSH
color codes before display:

### Headers

```markdown
# COMMAND NAME        ← bold cyan — use for the top-level title
## Section heading    ← bold yellow
### Subsection        ← bold white
```

### Inline code and code blocks

Inline code (`` `code` ``) renders in **green**. Use it for command syntax,
flag names, and exact strings players should type.

Fenced code blocks (` ``` `) render as an indented green block — ideal for
multi-line examples:

````markdown
```
> mail Bob
Draft started.
> mail send
Message sent.
```
````

### Lists

```markdown
- First item
- Second item
```

Renders as:

```
  • First item
  • Second item
```

### Bold and italic

```markdown
**important thing**   ← bold white
*emphasized*          ← italic
```

### Word wrap

All text is automatically word-wrapped at **78 characters**. You do not need
to manually break lines — write prose naturally and the renderer handles it.
Indentation on list items is preserved across wrapped lines.
---

## Tables

Markdown tables are fully supported and are formatted to fit within 78
characters. Write them in standard Markdown syntax:

```markdown
| Command | Description |
|---------|-------------|
| `mail <player>` | Start a draft to a player |
| `mail send` | Send the current draft |
| `mail delete <#>` | Delete a message by number |
```

The renderer:
- Colors the header row bold yellow
- Colors inline code in cells green
- Distributes column widths proportionally if the natural widths exceed 78 chars
- Word-wraps individual cells that overflow their column

For tables with many columns or long content, prefer two-column layouts — they
give the most readable result at 78 characters.
---

## Color Codes

You can use MUSH color codes directly in help files for custom styling:

| Code | Effect |
|------|--------|
| `%ch` | Bold / bright |
| `%cn` | Reset to default |
| `%cr` | Red |
| `%cg` | Green |
| `%cy` | Yellow |
| `%cb` | Blue |
| `%cm` | Magenta |
| `%cc` | Cyan |
| `%cw` | White |
| `%ci` | Italic |

**Example:**

```markdown
%ch%cyWARNING:%cn This destroys the object permanently.
```

Renders as bold yellow "WARNING:" followed by normal text.

> **Tip:** Use color sparingly. The Markdown renderer already styles headers,
> code, and lists consistently. Reserve manual color codes for callouts and
> warnings.
---

## How Players Access Help

```
help                  ← shows all topics in a 4-column index
help mail             ← shows mail/index.md + subtopic list
help mail/send        ← shows mail/send.md directly
help send             ← finds the first file named "send" anywhere
help @dig             ← finds building/@dig.md
help dig              ← same result (@ stripped on lookup)
help/section mail     ← lists all topics in the mail section
```
---

## Admin Commands

Admins and wizards can create, update, and delete help entries at runtime
without touching the filesystem. DB entries take priority over file-based
entries (priority 100 vs 50).

```
+help/set <topic>=<text>   ← create or update a DB help entry
+help/del <topic>          ← delete a DB help entry
+help/reload               ← bust the file cache (pick up new files)
```

`<text>` supports the same Markdown syntax as file-based entries. Use `\n`
for line breaks when typing multi-line content in-game.
---

## REST API

The plugin exposes a REST API for reading and managing help entries externally.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/help` | public | List all sections and topics |
| `GET` | `/api/v1/help/:topic` | public | Fetch a single topic (`?format=md` for raw) |
| `POST` | `/api/v1/help/:topic` | admin | Create or update an entry |
| `DELETE` | `/api/v1/help/:topic` | admin | Delete an entry |

**Example — fetch a topic as Markdown:**

```
GET /api/v1/help/dig?format=md
Authorization: Bearer <token>
```
---

## Per-Plugin Help Folders

Plugins can register their own help directories so their topics appear in the
global index without copying files into the game's `help/` folder. Call
`registerHelpDir()` inside your plugin's `init()`:

```ts
import { registerHelpDir } from "jsr:@ursamu/help-plugin";
import { fromFileUrl } from "@std/path";

export default {
  name: "my-plugin",
  async init() {
    registerHelpDir(fromFileUrl(new URL("../help", import.meta.url)));
  }
} satisfies IPlugin;
```

The directory is scanned on startup (and on `+help/reload`). Files follow the
same naming conventions as the main `help/` folder.
---

## Tips

### Structure for commands

Follow this pattern for individual command topics — it keeps help consistent
across the game:

```markdown
# COMMAND NAME

One-sentence description of what the command does.

## Syntax

`command <required> [optional]`

## Description

Longer explanation. What it does, when to use it, any caveats.

## Examples

```
> command argument
Result shown here.
```

## See Also

- `related-command` — brief note on why it's related
```

### Keep the title uppercase

By convention, top-level `#` headers are ALL CAPS (`# MAIL SEND`, `# @DIG`).
This matches classic MUSH help style and looks correct after the cyan coloring
is applied.

### Avoid deep nesting

Two levels of directories (`help/category/topic.md`) is the practical maximum.
Three or more levels are not surfaced cleanly in the subtopic listing.

### Admin-only topics

Put topics that should only be visible to staff in a directory prefixed with
`_` (e.g., `help/_admin/`). The underscore is cosmetic — the files are still
accessible to anyone who knows the topic name. If you need truly restricted
help, use `+help/set` to store the entry in the DB and gate display logic via
a plugin hook on `help:lookup`.

### Test your file

Connect as a player and type `help <yourtopic>`. Check that:
- Line lengths fit within 78 characters
- Tables align properly
- Code blocks are indented and green
- No raw Markdown syntax leaks through
