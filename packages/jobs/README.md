# @ursamu/jobs

**Version 1.1.2** — jobs system workflow + staff console nav.

See `docs/FEATURES.md` and `docs/STABLE.md`.

```ts
import jobsPlugin, {
  registerJobBuckets,
  registerJobActionHook,
  runSelect,
} from "@ursamu/jobs";
```

## Peers

mush ^1.0 · help ^1.0 · mail ^2.5 (optional notify)

## Highlights

| Area | Commands |
|------|----------|
| Lists | +jobs[/mine\|new\|overdue\|…] |
| Select | +jobs/select (new \| overdue) & mine sort=due |
| Reports | +jobs/reports open |
| Hygiene | +jobs/compress, +jobs/clean |
| Groups | +jgroup/create\|add\|del |
| Lifecycle | +job/approve\|deny\|complete\|due\|… |
| Players | +request, +bug, +typo, +pitch |

## Letters config (optional)

```json
{
  "plugins": {
    "jobs": {
      "letters": {
        "approve": {
          "mail": "Approved #%n %t — %c"
        }
      }
    }
  }
}
```

Placeholders: `%n` `%t` `%r` `%s` `%b` `%c`.

## License

MIT
