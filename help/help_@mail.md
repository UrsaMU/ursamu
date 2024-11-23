---
category: Communication
---

# @MAIL Command

The @MAIL command lets you send and receive messages to other players through
the in-game mail system.

## Syntax

`@mail` - Check your mailbox `@mail <player>=<subject>/<message>` - Send mail
`@mail/read <#>` - Read specific message `@mail/delete <#>` - Delete a message
`@mail/clear` - Clear read messages

## Examples

```
@mail
@mail wizard=Help needed/Could you help me with building?
@mail/read 1
@mail/delete 2
@mail/clear
```

## Options

- /read - Read a specific message
- /delete - Delete a message
- /clear - Clear read messages
- /forward <#>=<player> - Forward a message
- /reply <#>=<message> - Reply to a message
- /list - List all messages
- /unread - List unread messages

## Message Status

- N - New message
- U - Unread message
- F - Forwarded message
- R - Replied to
-
  -
    - Read message

See also:

- help page (Sending quick messages)
- help channels (Public communication)
