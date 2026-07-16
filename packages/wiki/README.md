# @ursamu/wiki

File-based markdown wiki plugin for UrsaMU.

## Configuration

This plugin supports custom database collection names. In your `config.json`,
you can customize the collection name:

```json
{
  "plugins": {
    "wiki": {
      "db": "wiki.subscriptions"
    }
  }
}
```
