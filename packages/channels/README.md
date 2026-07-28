# @ursamu/channels

MUX-style chat channels for UrsaMU: player aliases, staff admin,
history, and optional connect/join announcements.

**Current version: 1.0.0** (stable). See `CHANGELOG.md`.

## 1.0 contract (public API)

### Supported player commands

| Command | Purpose |
|---------|---------|
| `addcom <alias>=<channel>` | Join with alias |
| `delcom <alias>` | Drop one alias |
| `clearcom` | Drop all aliases |
| `comlist` | List your aliases |
| `allcom on\|off\|who` | Bulk mute / unmute / who |
| `comtitle <alias>=<title>` | Per-channel title |
| `<alias> <text>` | Speak |
| `<alias> :` / `;` | Pose / semipose |
| `<alias> on\|off\|who` | Toggle receive / who |
| `clist` [/full] [/headers] | List public channels |
| `@chanhistory` / `@chantranscript` | History (if logging on) |

Leading `@` is optional on most of the above.

### Supported staff commands (admin+ or owner)

| Command | Purpose |
|---------|---------|
| `@chancreate` [/hidden] [/lock] | Create channel |
| `@chandestroy` | Destroy channel + history |
| `@chanset <chan>/<prop>=<val>` | Configure channel |
| `@cemit` [/noheader] | Staff broadcast |
| `@cboot` [/quiet] | Remove subscriber |
| `@cwho` [/all] | List subscribers |

**@chanset properties:** `header`, `lock`, `hidden`, `masking`,
`log`, `historyLimit`, `announce`.

`announce` posts connect/disconnect/join/leave **in-game only**
(never via `channel:message` / Discord).

### Install

```typescript
import { channelsPlugin } from "jsr:@ursamu/channels";
import { registerPlugin } from "jsr:@ursamu/mush";

registerPlugin(channelsPlugin);
```

Or list `"@ursamu/channels"` in `server.plugins`.

### Config (optional)

```json
{
  "plugins": {
    "channels": {
      "db": "server.chans",
      "historyDb": "server.chan_history",
      "defaults": [
        {
          "name": "Public",
          "alias": "pub",
          "lock": "connected",
          "announce": true
        },
        {
          "name": "Admin",
          "alias": "ad",
          "lock": "connected admin+",
          "announce": false
        }
      ]
    }
  }
}
```

### Requirements

- `jsr:@ursamu/mush` >= 1.0.0
- `jsr:@ursamu/core` >= 1.0.0
- `jsr:@ursamu/help` >= 0.1.9 (help files)

### Explicit non-goals (not TinyMUX 2.12)

This is **MUX-style**, not a full TinyMUX 2.12 comsys port:

- No channel **objects** in the game DB (rows in a DBO collection)
- No channel **economy** (no charge, balance, or paid speech)
- `@clist/full` shows name, flags (H/M/L/A), owner, connected users
- One join/speak **lock** string, not full MUX multi-lock attrs
- No CHAN* softcode attributes on channel objects

Breaking changes after 1.0 will require a major version bump.

### Help

In-game: `+help channels`, `+help player`, `+help staff`.

### Develop

```bash
deno task test
deno task check
```

### Changelog notes (0.2.x)

- Help rewritten to project standard (player/ + staff/)
- Unit tests for player aliases, clist visibility, admin gates,
  chanset parsing
- Documented public command surface and non-goals
