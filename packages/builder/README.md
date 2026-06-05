# @ursamu/builder

World-building commands and REST API for UrsaMU.

## Commands

| Command | Lock | Description |
|---|---|---|
| `@create <name>` | builder+ | Create a thing in inventory |
| `@destroy <target>` | connected | Destroy an object |
| `@clone <target>[=<name>]` | builder+ | Clone an object |
| `@chown <target>=<player>` | admin+ | Transfer ownership |
| `@desc <target>=<text>` | connected | Set description |
| `@name <target>=<name>` | connected | Rename an object |
| `@parent <target>=<parent>` | connected | Set parent for inheritance |
| `@moniker <target>=<display>` | admin+ | Set display name |
| `@nameformat/@descformat/@conformat/@exitformat` | connected | Format attributes |
| `@dig[/teleport] <room>[=<to>,<from>]` | builder+ | Create room + exits |
| `@open[/inventory] <name>=<room>[,<back>]` | builder+ | Create exits |
| `@link <target>=<dest>` | connected | Set home/destination |
| `@unlink <target>` | connected | Clear link |
| `@quota[/list] [<player>=<n>]` | connected | View/set quota |
| `@examine [<target>]` | connected | Detailed object inspection |

## REST API

Mounted at `/api/v1/building` — requires builder+ access.

- `GET /rooms` — list your rooms
- `POST /rooms` — create room (`{ name, description?, parent? }`)
- `GET /rooms/:id` — room detail
- `PATCH /rooms/:id` — update name / description
- `DELETE /rooms/:id` — destroy room + orphaned exits
- `POST /rooms/:id/exits` — create exit (`{ name, destination }`)
- `GET /objects/:id` — any object detail

## Usage

```typescript
import { builderPlugin } from "@ursamu/builder";
// Register in your plugin manifest or pass to loadPlugins()
```
