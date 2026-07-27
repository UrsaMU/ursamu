---
hidden: true
---
# @OSUCC

Sets the Other Success message (TinyMUX-style).

## Syntax

`@osucc <object>=<message>`

## Description

Shown to others in the **origin** room when someone successfully uses
an exit (or picks up a thing). The actor name is prepended:
`Alice heads north.`

On exits, if unset, defaults to: `has left.`

## Example

`@osucc North=heads north.`
