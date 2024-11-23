---
category: Building
---
# @DESCRIBE Command

The @DESCRIBE command is used to set descriptions for objects, rooms, and characters. These descriptions are what others see when they look at the target.

## Syntax
`@describe <target>=<description>`
`@describe me=<description>`
`@describe here=<description>`

## Examples
```
@describe me=A tall figure with piercing eyes and a mysterious demeanor.
@describe here=A dimly lit room with ancient tapestries adorning the walls.
@describe box=A small wooden box with intricate carvings on its surface.
```

## Notes
* You can use multiple lines in your description by using the | character
* ANSI color codes can be used to add color to descriptions
* You must have appropriate permissions to describe objects you don't own

See also:
- help look (Viewing descriptions)
- help shortdesc (Setting short descriptions)
- help moniker (Setting character monikers)
