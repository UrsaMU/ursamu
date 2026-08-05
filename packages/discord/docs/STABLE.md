# Stable API contract (discord 1.0)

Breaking changes to **stable** exports require a **major** bump.

## Stable (semver-covered)

**Plugin**
  `discordPlugin` / default export — `init` / `remove`

**Config (DBO `discord.config`)**
  `getDiscordConfig`, `getWebhookUrl`, `setWebhook`,
  `clearWebhook`, `setChannelLink`, `clearChannelLink`,
  `gameChannelForDiscord`, `setPublicUrl`, `getBotCredentials`
  Types: `IDiscordConfig`, `IDiscordBotCredentials`

**Webhooks**
  `postWebhook`
  Types: `WebhookPayload`, `DiscordEmbed`

**Channel bridge**
  `formatDiscordChannelBody`, `injectChannelMessage`,
  `onGameChannelMessage`
  Type: `IChannelMessageEvent`

**Help embeds**
  `markdownToDiscord`, `truncateDiscord`,
  `embedForEntry`, `embedForIndex`, `embedForSection`

**Helpers**
  `clean`, `resolveAvatar`, `COLORS`

## In-game commands (admin+)

`@discord/set`, `@discord/link`, `@discord/publicurl`,
`@discord/list`, `@discord/test`, `@discord/register-commands`

## REST

| Path | Auth | Role |
|------|------|------|
| `POST /api/v1/discord/interactions` | Discord signature | `/help` etc. |
| Other `/api/v1/discord/*` | staff JWT | config REST |

## Env secrets (never stored in DB)

`DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`,
`DISCORD_PUBLIC_KEY`, optional `DISCORD_GUILD_ID`

Without bot env: **webhooks-only** mode (stable behavior).

## Dependencies

- `@ursamu/mush@^1.0.0`, `@ursamu/core@^1.0.0`
- `@ursamu/help@^1.0.0` (plugin dep `help` >= 1.0.0)
- `@ursamu/channels@^1.0.0` (channel bridge events)
- `@ursamu/jobs@^0.1.1` (optional job webhooks; soft)

## Evolving

- Gateway reconnect backoff details
- Slash command set beyond `/help`
- Scene / job embed field layouts
- Exact Discord API version pin

## Version policy

| Change | Bump |
|--------|------|
| Remove/rename stable export or command | major |
| New slash cmd, additive config field | minor |
| Bugfix, docs, tests | patch |
