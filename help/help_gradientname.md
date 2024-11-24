# Gradientname Command

## Syntax

```
+gradientname <name>=<color1>,<color2>,[...]
```

## Description

The gradientname command allows you to set your character's name with a color
gradient effect. You can specify two or more colors to create a smooth
transition across your name. The colors will be evenly distributed across the
letters of your name.

## Colors

You can specify colors in two ways:

1. Named colors (e.g., red, blue, green)
2. Hex color codes (e.g., #ff0000, #0000ff)

See 'help colors' for a complete list of available named colors.

## Examples

```
+gradientname me=red,blue
+gradientname me=crimson,gold,emerald
+gradientname me=#ff0000,#00ff00,#0000ff
```

## Notes

- You must specify at least two colors to create a gradient effect
- Colors can be mixed between named colors and hex codes
- The command requires you to be connected to use it
- The gradient effect will be visible to others when they see your name

## See Also

- help colors - Complete list of available colors
- help name - Information about the basic name command
- help moniker - Information about custom name display
