# @ursamu/bbs

Full-featured Myrddin-style BBS plugin for UrsaMU.

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
