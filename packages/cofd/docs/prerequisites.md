# CoFD Prerequisite DSL Reference Guide

To enforce Chronicles of Darkness rulebook requirements, Merits and Powers support a custom, highly optimized, and natural **Prerequisite DSL (Domain Specific Language)**. Prerequisite rules are defined as an array of strings in JSON files (e.g. `resources/merits.json`).

---

## 1. Syntax Overview
Prerequisite expressions fall into two categories:

### A. Template Restrictions
Specifies that a character must possess a certain supernatural (or mortal) template.

*   **Shorthand Syntax**: `@templateName`
    *   Example: `@vampire` (Requires the character to be a Vampire)
    *   Example: `@mortal` (Requires the character to be a Mortal)
*   **Explicit Syntax**: `template=templateName` or `template==templateName`
    *   Example: `template=vampire`
    *   Example: `template==mortal`

### B. Trait Comparisons
Enforces that a trait must meet a numerical rating comparison.

*   **Syntax**: `traitName[operator]rating`
*   **Supported Operators**: `>=`, `>`, `<=`, `<`, `=`, `==`
*   **Examples**:
    *   `dexterity>=3` (Requires Dexterity at 3 or higher)
    *   `athletics>=2` (Requires Athletics at 2 or higher)
    *   `integrity>=5` (Requires Integrity at 5 or higher)
    *   `wyrd>=2` (Requires Wyrd at 2 or higher)
    *   `fast reflexes>=1` (Requires the 'Fast Reflexes' merit)
    *   `vigor>=2` (Requires the 'Vigor' power)

---

## 2. Evaluation & Trait Resolution Priority
When a trait key (such as `dexterity` or `integrity`) is parsed from a prerequisite string, the parser searches the character sheet (`CofdSheet`) in this specific order:

1.  **Check for `template` key**: If the key is exactly `template`, performs a string equality comparison (lowercased) against the character's template.
2.  **Attributes**: Checks `sheet.attributes[key]`. Baseline default rating is **1** if not present.
3.  **Skills**: Checks `sheet.skills[key]`. Baseline default rating is **0** if not present.
4.  **Merits**: Checks `sheet.merits[key]`. Baseline default rating is **0** if not present.
5.  **Powers**: Checks `sheet.powers[key]`. Baseline default rating is **0** if not present.
6.  **Morality / Power Stat**: 
    *   Checks if `key` matches the active template's lowercase Morality name (e.g. `integrity`, `humanity`). If so, compares against `sheet.moralityValue`.
    *   Checks if `key` matches the active template's lowercase Power Stat name (e.g. `blood potency`, `wyrd`). If so, compares against `sheet.powerStatValue`.

If the key does not match any known trait on the character sheet, the resolved value is **0**.

---

## 3. JSON Configuration Example
Here is how prerequisites are declared within `resources/merits.json`:

```json
[
  {
    "key": "giant",
    "name": "Giant",
    "category": "Physical",
    "allowedDots": [4],
    "prereqs": []
  },
  {
    "key": "iron stomach",
    "name": "Iron Stomach",
    "category": "Physical",
    "allowedDots": [2],
    "prereqs": ["stamina>=3"]
  },
  {
    "key": "fleet of foot",
    "name": "Fleet of Foot",
    "category": "Physical",
    "allowedDots": [1, 2, 3],
    "prereqs": ["athletics>=2"]
  }
]
```
