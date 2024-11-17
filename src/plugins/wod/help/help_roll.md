# Roll Command

## Syntax
`+roll <pool>`

The roll command is used to make dice rolls for World of Darkness games. The pool can be composed of:
- Single attributes/abilities (e.g., `+roll strength`)
- Multiple stats (e.g., `+roll strength brawl`)
- Modifiers (e.g., `+roll strength +2 -1`)
- Raw numbers (e.g., `+roll 5`)

## Mechanics
- Each die that rolls 6 or higher counts as a success
- Rolling two 10s (or multiples of two 10s) counts as a critical success, adding 2 bonus successes
- Results are color coded:
  - Red: 1s (critical failures)
  - Yellow: 2-5 (failures)
  - Green: 6+ (successes)

## Examples
```
+roll strength                    (rolls strength rating)
+roll strength athletics         (rolls strength + athletics)
+roll strength +2                (rolls strength + 2 bonus dice)
+roll strength -1 athletics      (rolls strength + athletics - 1 die)
+roll 5                          (rolls 5 dice)
```

The command will display your total successes and show each individual die result in the appropriate color.
