---
topic: "@destroy"
section: building
---

# @destroy

Destroy an object. Prompts for confirmation unless `/confirm` is given.

## Syntax
  `@destroy <target>`
  `@destroy/confirm <target>`
  `@destroy/override <target>`

## Switches
- `/confirm` — skip confirmation prompt and destroy immediately.
- `/override` — bypass safety checks (use with care).

## Notes
- Destroying a room sends occupants home, removes orphaned exits, and
  refunds quota to the non-staff owner.

## Examples
  `@destroy Rusty Sword`
  `@destroy/confirm #12`
  `@destroy/confirm here`
