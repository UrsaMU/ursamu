# @ursamu/bbs

**0.1.1** — Full-featured **Myrddin-style** BBS for UrsaMU
(command UX parity, not softcode clone). See `docs/MYRDDIN.md`.

Requires `@ursamu/mush@^1.0.0` and `@ursamu/help@^1.0.0`.

## Configuration

This plugin supports custom database collection names. In your `config.json`,
you can customize the collection names:

```json
{
  "plugins": {
    "bbs": {
      "db": {
        "bboards": "server.bboards",
        "posts": "server.bboard_posts"
      }
    }
  }
}
```
