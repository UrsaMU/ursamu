# CoFD JSON Resource Documentation

Chronicles of Darkness (CoFD) traits are fully data-driven. The system parses standard JSON resource files upon server initialization. If files are modified, modifications are automatically active upon the next server reboot.

## Location
All JSON resources reside in the `resources/` folder:
- `resources/attributes.json` — Categorized Attributes
- `resources/skills.json` — Categorized Skills
- `resources/merits.json` — Defined Merits, ratings, and prerequisites

---

## 1. Attributes Schema (`resources/attributes.json`)
Defines the `mental`, `physical`, and `social` attributes. Each category is an array of lowercase strings.

### Schema:
```json
{
  "mental": [ "intelligence", "wits", "resolve" ],
  "physical": [ "strength", "dexterity", "stamina" ],
  "social": [ "presence", "manipulation", "composure" ]
}
```

---

## 2. Skills Schema (`resources/skills.json`)
Defines the `mental`, `physical`, and `social` skills. Each category is an array of lowercase strings.

### Schema:
```json
{
  "mental": [ "academics", "computer", "crafts", "investigation", "medicine", "occult", "politics", "science" ],
  "physical": [ "athletics", "brawl", "drive", "firearms", "larceny", "stealth", "survival", "weaponry" ],
  "social": [ "animal ken", "empathy", "expression", "intimidation", "persuasion", "socialize", "streetwise", "subterfuge" ]
}
```

---

## 3. Merits Schema (`resources/merits.json`)
Defines the list of valid merits. It is an array of Merit objects.

### Object Definition:
*   `key` (string): The lowercase, standardized identifier of the merit.
*   `name` (string): The human-readable name of the merit (displays on sheets).
*   `category` (string): One of `"Mental"`, `"Physical"`, `"Social"`, or `"Supernatural"`.
*   `allowedDots` (array of numbers): An array of specific dot ratings allowed for this merit. E.g., `[4]` means the merit can only be taken at exactly 4 dots. `[1, 2, 3]` means it can be taken at 1, 2, or 3 dots.
*   `prereqs` (array of strings): An array of prerequisite expressions evaluated against the character's sheet. See `docs/prerequisites.md` for syntax specifications.

### Example:
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
  }
]
```
