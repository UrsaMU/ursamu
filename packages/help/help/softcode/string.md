---
topic: "softcode/string"
section: softcode
---
# Softcode — String Functions

**`tr(from, to, string)`** — maps each char in `from` to the corresponding
char in `to`. If `to` is shorter, the last char fills remaining mappings.
Empty `to` deletes all matches.

## Examples
  `[tr(aeiou,*,hello world)]`  → h\*ll\* w\*rld
  `[tr(aeiou,,hello)]`         → hll  (vowels deleted)

**`printf(format, args...)`** — C-style formatted output. Use `%%` for a
literal `%` (bare `%d` is a MUSH substitution and causes a parse error).

## Examples
  `[printf(%%d items,5)]`     → 5 items
  `[printf(%%05d,42)]`        → 00042
  `[printf(%%-10s|,hi)]`      → hi        |
  `[printf(%%8.2f,3.14159)]`  → 3.14

## See Also
  softcode, softcode/string/more, softcode/flow
