---
topic: "@lock"
section: building
aliases: ["@unlock"]
---
# @lock / @unlock

**@lock** sets a key expression on an object. Types: (none)=get,
`use`, `enter`, `leave`, `link`.

## Syntax
  `@lock <target>=<key>`
  `@lock/<type> <target>=<key>`
  `@unlock <target>`
  `@unlock/<type> <target>`

## Notes
- On lock failure: `FAIL`, `OFAIL`, `AFAIL` attributes fire.

## Examples
  `@lock sword=wizard`
  `@lock/use lever=WIZARD`
  `@lock/enter here=flag(admin)`
  `@unlock sword`

## See Also
  `action-attrs`, `@set`
