---
topic: "+help/set"
section: general
aliases: ["+help/del"]
---
# +help/set

Create or update a runtime help entry stored in the database.
Database entries override file-based and inline help for the same topic.

## Syntax
  `+help/set <topic>=<text>`
  `+help/del <topic>`

## Notes
- **topic** — lowercase slug; use `/` for sub-topics (e.g. `combat/dodge`).
- **text** — markdown content. Supports `**bold**`, `` `code` ``, and lists.

## Examples
  `+help/set house-rules=# House Rules\nNo griefing.`
  `+help/set combat/dodge=Dodge reduces incoming damage by 50%.`
  `+help/del house-rules`

## See Also
  +help/reload
