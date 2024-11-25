# page

## Syntax

- `page <player>=<message>` - Send a private message to a player
- `p <player>=<message>` - Shortcut for page
- `page <message>` - Page the last person you paged
- `page <player1> <player2>=<message>` - Page multiple players at once

## Description

The `page` command allows you to send private messages to one or more players.
The recipients will see who the message is from, and you'll see confirmation of
your sent message.

## Special Features

- You can use pose-style messages in pages:
  - `;` for no space: `page bob=;waves` shows: `YourName waves`
  - `:` for space: `page bob=:waves` shows: `YourName waves`
- The system remembers who you last paged, so you can just use `page <message>`
  to reply
- You can page multiple people at once by listing their names

## Examples

```
page Bob=Hello there!
```

Bob sees: `From afar, YourName pages: Hello there!`

```
p Bob Jane=Hey everyone!
```

Bob and Jane see: `To (Bob, Jane), YourName pages: Hey everyone!`

```
page :waves hello
```

Last paged person sees: `From afar, YourName waves hello`

## Notes

- The command requires you to be connected
- Your display name (moniker) will be used if you have one set
- If you have an alias set, it will be shown in parentheses
- You can only page connected players
- Using just `page <message>` will send to the last person/group you paged
