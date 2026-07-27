---
hidden: true
---
# @ODROP

Others-drop / arrival message (TinyMUX-style).

## Syntax

`@odrop <object>=<message>`

## Description

On **exits**: shown to others in the **destination** room when someone
arrives through the exit. Actor name is prepended.

If unset on an exit, defaults to: `has arrived.`

On **things**: others see this when the object is dropped.

## Example

`@odrop North=arrives from the south.`
`@odrop ball=drops a shiny red ball.`
