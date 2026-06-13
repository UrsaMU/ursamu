---
topic: "@wipe"
section: building
---

# @wipe

Remove all soft attributes from an object.

## Syntax
  `@wipe <target>`
  `@wipe/confirm <target>`

## Switches
- `/confirm` — execute the wipe without a preview prompt.

## Notes
- Without `/confirm`, shows a preview and asks you to re-run with the switch.

## Examples
  `@wipe #12`
  `@wipe/confirm #12`
  `@wipe/confirm here`

## See Also
  `&ATTR`, `@set`
