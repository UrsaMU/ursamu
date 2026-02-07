# MAIL

The mail system allows players to send and receive messages.

## Syntax

```
mail                               List messages
mail <#>                           Read message <#>
mail <player>                      Start a draft to <player>
mail <player> <subject> = <msg>    Quick send (one-liner)
mail send                          Send current draft
mail delete <#>                    Delete message
```

## Composition

When you start a draft with `mail <player>`, you can use the following commands:

- `mail subject <text>`: Set the subject line.
- `-<text>`: Append text to the message body.
- `mail proof`: View the current draft.
- `mail abort`: Discard the current draft.
- `mail send`: Send the message.

## Examples

**Quick Send:** `mail Bob Meeting = Can we meet at the park?`

**Drafting:**

```
> mail Bob
Draft started to Bob.
> mail subject Project
Subject set: Project
> -Hi Bob,
Added to message.
> -Just checking in.
Added to message.
> mail send
Message sent.
```
