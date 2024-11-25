# @remit

## Syntax

`@remit <room>=<message>` - Emits a message to a room without showing the sender

## Description

The `@remit` command lets you emit a message to a specific room. This command
only works when targeting room objects, and like @emit, it shows no sender
information.

## Example

```
@remit #123=Thunder rumbles in the distance.
```

Everyone in room #123 will see the message "Thunder rumbles in the distance."

## Notes

- Requires you to be connected to use
- Only works when targeting room objects
- The message will be shown to everyone in the targeted room
- No sender information is attached to the message
- Useful for creating room-specific atmospheric effects
- Different from @emit in that you can target a specific room rather than just
  your current location
