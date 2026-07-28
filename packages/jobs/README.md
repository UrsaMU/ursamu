# @ursamu/jobs

**Version 1.0.0** — Anomaly Jobs **workflow** standards on
`@ursamu/mush@^1.0.0`.

See `docs/ANOMALY.md` (parity matrix) and `docs/STABLE.md`.

```ts
import jobsPlugin, { registerJobBuckets } from "@ursamu/jobs";
registerJobBuckets(["PLOT", "BUILD"]);
```

## Peers

| Package | Role |
|---------|------|
| mush ^1.0 | Engine |
| help ^1.0 | Help dirs |
| mail ^2.5 | Optional notify mail |

## Players

| Command | Role |
|---------|------|
| `+request` | Submit / view / comment / cancel |
| `+myjobs` | Your open requests |
| `+bug` / `+typo` / `+pitch` | Quick-file presets |
| `+myjobs/nospam` | Suppress update mail |

## Staff

| Command | Role |
|---------|------|
| `+jobs`[/filter] | Lists (mine, new, overdue, …) |
| `+job`/`+job/…` | View + lifecycle (Anomaly acts) |
| `+archive` | Closed jobs |

Deferred: full `+jobs/select` DSL, jgroups, form letters,
reports (1.1+).

## License

MIT
