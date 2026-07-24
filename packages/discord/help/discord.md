+DISCORD

Bridge channels/jobs to Discord; Discord `/help` is private embeds.

SYNTAX
  @discord/set <topic>=<webhook-url>
  @discord/link <gameChannel>=<discordChannelId>
  @discord/publicurl <url>
  @discord/list | @discord/test <topic>
  @discord/register-commands

SWITCHES
  set/link  Game↔Discord maps (empty value clears).
  publicurl Avatar base https URL.
  list/test Show config or fire a test webhook.
  register-commands  Re-register Discord `/help`.

EXAMPLES
  @discord/set ooc=https://discord.com/api/webhooks/...
  @discord/link ooc=123456789012345678

SEE ALSO: +help channels
