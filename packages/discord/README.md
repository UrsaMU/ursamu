# @ursamu/discord

Discord bridge for UrsaMU: webhooks, two-way channel chat, and `/help`
slash command with private embeds.

## Features

| Feature | How |
|---------|-----|
| Game → Discord channels | Webhooks (custom name + avatar) |
| Discord → Game channels | Bot Gateway `MESSAGE_CREATE` |
| Job / presence / staff | Topic webhooks (`jobs`, `presence`, `staff`) |
| `/help` | Interactions HTTP → ephemeral embeds |

Loop prevention: Gateway ignores webhook posts and bots; outbound webhooks
skip events with `source: "discord"`.

## Install

```ts
import discordPlugin from "@ursamu/discord";
// or: jsr:@ursamu/discord

await mu(config, [discordPlugin], { pluginsDir });
```

Dependencies: `@ursamu/help` (for `/help`), channels for chat bridge.

## Environment (secrets)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_APPLICATION_ID` | for bot | App id |
| `DISCORD_BOT_TOKEN` | for bot | Gateway + register slash |
| `DISCORD_PUBLIC_KEY` | for `/help` | Ed25519 interaction verify |
| `DISCORD_GUILD_ID` | optional | Guild-scoped slash register |

Without these, the plugin still runs in **webhooks-only** mode.

## Discord Developer Portal

1. Create application + bot.
2. Enable **Message Content Intent**.
3. Invite bot: scopes `bot`, `applications.commands`.
4. Interactions Endpoint URL:
   `https://<your-host>/api/v1/discord/interactions`
   (must be public HTTPS for `/help`).
5. Channel perms: View Channel, Read Message History (webhooks handle
   outbound posts).

## In-game commands (admin+)

```
@discord/set <topic>=<webhook-url>     Game → Discord webhook
@discord/link <gameChan>=<discordId>   Discord → game map
@discord/publicurl <https-url>         Avatar base URL
@discord/list                          Show webhooks + links
@discord/test <topic>                  Fire a test webhook
@discord/register-commands             Re-register /help
```

Example two-way OOC:

```
@discord/set ooc=https://discord.com/api/webhooks/...
@discord/link ooc=123456789012345678
```

## `/help` slash command

| Usage | Result |
|-------|--------|
| `/help` | Private section index |
| `/help topic:<slug>` | Private topic embed |
| `/help section:<name>` | Private topic list |

Always **ephemeral** (only the invoker sees it). Markdown is normalized for
Discord embeds (headers → bold, MUSH codes stripped, 4096 cap).

## Architecture

```
Game channel ──channelEvents──► webhook ──► Discord
Discord ──Gateway──► inject + source:discord ──► Game
User ──POST /api/v1/discord/interactions──► /help embed
```

Config lives in DBO `discord.config` (`webhooks`, `links`, `publicUrl`).
Bot credentials are **never** stored in the DB.

## License

MIT

