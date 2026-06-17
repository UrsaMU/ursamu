# Conditions, Tilts & Aspirations — CoFD 2e Specification

This document specifies the **Conditions**, **Tilts**, and **Aspirations** subsystems for the UrsaMU Chronicles of Darkness (CoFD) 2e plugin. It is sourced from the *Chronicles of Darkness* core rulebook (2nd edition, "God-Machine Chronicle" baseline) and is the authoritative reference for command design, data shape, and content catalog.

---

## 1. Aspirations

### 1.1 Concept

Aspirations are short narrative statements describing what a character is actively trying to do or become. They are the player's contract with the Storyteller (ST) about what the player wants to see in play. Fulfilling them is the primary engine for **Beats** (the small XP unit; 5 Beats = 1 Experience).

### 1.2 Rules of Play

- **Active count**: A character normally has **three (3) active Aspirations** at any one time.
- **Mix**: Typically **two short-term** Aspirations and **one long-term** Aspiration, though the split is flexible at ST/table discretion.
  - *Short-term*: Achievable in a session or a short arc (e.g. "Win Marco's trust," "Find the missing notebook").
  - *Long-term*: A campaign-scale goal that defines the character (e.g. "Avenge my sister," "Become Chief of Detectives").
- **Beat reward**: Fulfilling an Aspiration grants the character **1 Beat**. Long-term Aspirations typically grant Beats at meaningful milestones as well as at completion (ST discretion).
- **Replacement**: When an Aspiration is fulfilled (or becomes impossible / no longer interesting), the player writes a new one to take its slot, subject to ST approval.
- **Roles**:
  - *Player* proposes Aspirations and announces when they think one has been fulfilled.
  - *Storyteller* approves Aspirations at creation/change time, confirms fulfillment, and may suggest revisions if an Aspiration is too vague, too easy, or unplayable.
- **Tone**: Aspirations should be actionable, specific enough that "yes/no, did it happen?" is answerable, and ideally tied to other PCs or NPCs.

### 1.3 Data Shape (per-character)

```json
"aspirations": [
  { "id": "asp-1", "text": "Find out who killed Dad", "term": "long",  "createdAt": "..." },
  { "id": "asp-2", "text": "Get on the Captain's good side", "term": "short", "createdAt": "..." },
  { "id": "asp-3", "text": "Score a clean apartment in the Burroughs", "term": "short", "createdAt": "..." }
]
```

Stored under the character's `state.cofd.aspirations` array. Cap enforced at 3 active.

---

## 2. Conditions — General Rules

### 2.1 Definition

A **Condition** is a persistent narrative+mechanical state attached to a character that modifies play until **resolved**. They are CoFD 2e's main way of representing fallout from rolls and story events that doesn't fit neatly into hit points or Willpower.

### 2.2 How They Are Gained

- **Exceptional Success** (5+ successes on a roll): Player picks a beneficial Condition appropriate to the action (e.g. *Inspired*, *Informed*, *Steadfast*).
- **Dramatic Failure** (Chance Die = 1, or player opts in for a Beat on a normal failure): The ST applies a harmful Condition.
- **Storyteller fiat**: As consequence of fiction (e.g. witnessing a horror imposes *Shaken* or *Spooked*).
- **Spending Willpower to take a Condition**: A player may voluntarily take an appropriate Condition (most often a Persistent one re-triggering, or one tied to a power) to gain the Beat economy or activate a supernatural effect.
- **Powers / Merits / Supernatural effects**: Many Disciplines, Gifts, Spells, Numina, etc., impose specific Conditions by rule.

### 2.3 Persistent vs Non-Persistent

- **Non-Persistent (default)**: Resolved once and gone. Typical lifespan: a scene to a chapter.
- **Persistent**: Long-running, often character-defining (e.g. *Addicted*, *Broken*, *Madness*). They can be *resolved* for the session/scene but tend to re-impose themselves and award Beats repeatedly as they recur. Persistent Conditions usually award a Beat each time they meaningfully complicate the character's life, not only at final resolution.

### 2.4 Resolution

Each Condition has a specific **Resolution** trigger written into its entry. When that trigger occurs:

1. The Condition ends (Persistent ones go dormant until they recur in fiction).
2. The affected character gains **1 Beat** (the default; some Conditions specify otherwise).
3. The player narrates the resolution at the table.

Conditions can also be **voluntarily resolved** when fiction supports it (e.g. apologizing to discharge *Guilty*); ST has final say.

### 2.5 Stacking & Limits

- A character may carry multiple Conditions simultaneously.
- The same Condition does not normally stack with itself; re-imposing an active Condition either refreshes its duration or has no additional effect (ST call).
- Beneficial Conditions (*Inspired*, *Informed*, *Steadfast*) are typically **spent** to gain their bonus on a specific roll, which resolves them.

---

## 3. Catalog — Core CoFD 2e Conditions

All Beat values are `1` unless otherwise noted. Persistent column: ✓ = Persistent.

| Name | Key | Persist | Description | Effect | Resolution | Beats |
|---|---|:---:|---|---|---|:---:|
| Addicted | `addicted` | ✓ | The character is hooked on a substance or behavior and suffers when deprived. | Without a fix, suffer −2 to all rolls and lose 1 Willpower per scene of withdrawal; must spend Willpower to resist using. | Successfully complete a sustained recovery arc (multiple sessions of abstinence), or hit rock bottom in a scene. | 1 |
| Blind | `blind` | ✓ | The character cannot see (one or both eyes, temporary or permanent). | All visual Perception rolls fail; physical actions vs sighted foes suffer −3 (or appropriate). Half-blind: −2. | Regain sight via medicine/magic, or accept the loss permanently and take this as a character trait (resolve once). | 1 |
| Bonded | `bonded` | ✓ | The character is supernaturally or emotionally bonded to a specific person/entity. | +2 to social rolls supporting the bonded party; −2 to act against their interests; powerful emotional pull. | The bond is broken (death, betrayal, ritual). | 1 |
| Broken | `broken` | ✓ | The character has been emotionally shattered by trauma. | Lose 1 Willpower from any failed action against the trauma's source; cannot regain Willpower from low Virtue. | Confront and overcome the source of trauma in a significant scene. | 1 |
| Charmed | `charmed` | | The character is favorably disposed to a specific person. | Cannot take hostile action against the charmer; suffers −2 to disbelieve their lies. | The charmer betrays the character, or the scene/effect ends. | 1 |
| Competitive | `competitive` | | A specific rivalry has the character's full focus. | +2 to actions taken directly against the rival in the current contest. | Win or lose the contest decisively. | 1 |
| Confused | `confused` | | The character cannot make sense of the situation. | −2 to Mental and Social rolls relying on clear thought; cannot benefit from teamwork. | Step away from the source of confusion for a scene, or have the situation explained clearly. | 1 |
| Connected | `connected` | | The character has just made a useful inroad with a group/faction. | +2 to Social rolls with that faction for the duration. | Use the connection on a significant roll (spends the Condition). | 1 |
| Cowed | `cowed` | | The character has been intimidated into submission. | Cannot take aggressive action against the intimidator while present; −2 to resist their further Social pressure. | The intimidator leaves the scene, or the character spends Willpower to defy them. | 1 |
| Delusional | `delusional` | ✓ | The character believes something untrue with conviction. | −2 to Mental rolls about the delusion's subject; may act on false premises. | Encounter incontrovertible proof in a dramatic scene. | 1 |
| Demoralized | `demoralized` | | The character has lost faith in a cause or themself. | Cannot spend Willpower on actions related to the cause. | Re-affirm or abandon the cause through play. | 1 |
| Deprived | `deprived` | | Lacking a normal need (food, sleep, vice). | −1 to all rolls; cannot regain Willpower from the lacking source. | Acquire and indulge in the missing need. | 1 |
| Disabled | `disabled` | ✓ | Lasting physical impairment (lost limb, chronic pain). | Specific roll penalties tied to the disability (ST sets). | Resolve once when the character incorporates it into identity, or is healed. | 1 |
| Embarrassing Secret | `embarrassing-secret` | | The character has something they desperately don't want known. | Anyone with the secret can leverage it (+2 to coerce/blackmail). | The secret is exposed publicly, or rendered moot. | 1 |
| Fugue | `fugue` | ✓ | The character periodically blacks out and acts out a buried compulsion. | Lose narrative control to ST during a fugue episode; no memory after. | Discover and address the underlying trauma. | 1 |
| Guilty | `guilty` | | The character is wracked with guilt over a recent act. | −2 to Resolve+Composure rolls; cannot regain Willpower from low Virtue this scene. | Confess, atone, or rationalize the act away in play. | 1 |
| Hungry | `hungry` | | Needs a specific feeding (food, blood, essence, etc.). | −1 to rolls; supernatural feeders may roll to resist frenzy. | Feed. | 1 |
| Inspired | `inspired` | | Struck by a flash of insight or creative drive. | Spend to gain +2 dice on a single roll related to the inspiration. | Spend the bonus on a roll. | 1 |
| Informed | `informed` | | Possesses specific timely intelligence. | Spend to add +2 dice to a single Mental/Investigation roll on the topic. | Spend the bonus on a roll. | 1 |
| Leveraged | `leveraged` | | Someone has blackmail or coercive material on the character. | The leverager can compel a single action; refusing it costs Willpower. | Resolve the leverage (pay, expose, eliminate). | 1 |
| Lost | `lost` | | The character is geographically or spiritually disoriented. | −2 to navigation, tracking, and orientation rolls. | Reach a known landmark or have someone guide them out. | 1 |
| Madness | `madness` | ✓ | A deep, lasting derangement. | Triggers under specific circumstances (ST/player set); imposes other Conditions or Willpower loss. | Long-term therapy/quest arc, or accept as permanent. | 1 |
| Mute | `mute` | ✓ | The character cannot speak. | Cannot make rolls requiring speech; −3 to most Social. | Cure (medical/magical) or fully adapt to alternate communication. | 1 |
| Notoriety | `notoriety` | ✓ | The character is publicly infamous for some deed. | −2 to Social rolls with people who know; +2 to Intimidation about the deed. | Publicly redeem oneself or the story is buried/forgotten. | 1 |
| Obsession | `obsession` | ✓ | A specific subject dominates the character's thoughts. | Must spend Willpower to focus on anything else for a scene. | Achieve the obsession's goal, or be forced to walk away in a dramatic scene. | 1 |
| Shadow Soul | `shadow-soul` | ✓ | The character carries a fragment of darkness/possessing presence. | Periodically must act on the shadow's urges or spend Willpower. | Exorcism, integration, or destruction of the shadow. | 1 |
| Shaken | `shaken` | | Recent fright has rattled the character. | Lose 1 Willpower point if forced to confront the source again this scene. | Confront the source successfully, or flee the scene entirely. | 1 |
| Spooked | `spooked` | | Brushed against the supernatural and unsettled by it. | Choose: flee/avoid (no roll possible against source) or investigate (Beat when resolved). | Successfully investigate and rationalize the experience, or flee permanently. | 1 |
| Steadfast | `steadfast` | | Bolstered by conviction. | Spend to gain +2 dice on a roll resisting fear, doubt, or coercion. | Spend the bonus on a roll. | 1 |
| Stigmata | `stigmata` | ✓ | The character bleeds from supernatural wounds at meaningful times. | Lose 1 lethal damage when the Condition triggers in a scene. | Address the spiritual cause. | 1 |
| Stumbled | `stumbled` | | Off balance physically or socially. | −2 to the character's next relevant action. | Make the next relevant action. | 1 |
| Stunned | `stunned` | | The character lost initiative to a blow or shock. | Lose next instant action (or next turn in combat). | One turn passes. | 1 |
| Swooning | `swooning` | | The character is romantically/sexually fixated on someone. | Cannot take direct hostile action against the target; −2 to resist their Social rolls. | The target spurns them, or the relationship is consummated/resolved. | 1 |
| Wanton | `wanton` | | The character is in a state of reckless indulgence. | +1 to actions taken in pursuit of indulgence; −2 to caution-based rolls (Stealth, Subterfuge). | Indulgence ends in consequence; scene closes. | 1 |
| Guarded | `guarded` | | On heightened defensive footing socially. | +2 to resist Social maneuvering for the scene. | Resolve at end of scene, or when the character lowers their guard. | 1 |

> **Note:** *Informed* and *Guarded* are included as widely-used core 2e Conditions even though not listed in the prompt's minimum set. Additional supernatural-template-specific Conditions (Vampire's *Bestial*, Mage's *Scoured*, etc.) live in their respective splat books and are out of scope for this core spec.

---

## 4. Tilts

### 4.1 Conditions vs Tilts

| | Conditions | Tilts |
|---|---|---|
| **Scope** | Persist across scenes/sessions | Last only the **current scene/combat** |
| **Use case** | Narrative consequences, beats, character arcs | Tactical battlefield/environment effects |
| **Beats** | Yes, on resolution | No (typically) |
| **Examples** | Shaken, Addicted, Inspired | Knocked Down, Blinded, Heavy Rain |

Tilts are CoFD 2e's "in-combat status effects." They expire when the scene ends; they do **not** award Beats on resolution.

### 4.2 Personal Tilts (Core)

Applied to a specific character.

- **Arm Wrack** — One arm disabled; cannot use two-handed actions; −2 to actions with the affected limb.
- **Beaten Down** — The character has been worked over; must spend Willpower to take violent action.
- **Blinded** — Cannot see (one or both eyes for the scene); −3 to sight-based actions, or auto-fail.
- **Deafened** — Cannot hear; −3 to hearing-based Perception; surprised more easily.
- **Drugged** — Under the influence; −2 to Mental and Physical rolls; sleepy/euphoric per drug.
- **Insane** — Brief psychotic break; ST takes control of the character briefly.
- **Insensate** — Knocked out or otherwise unable to act.
- **Knocked Down** — Prone; −2 to attack, defenders +2; must spend an action to stand.
- **Leg Wrack** — One leg disabled; Speed halved; −2 to Physical rolls needing footing.
- **Poisoned** — Toxin in system; lose Health per interval per toxicity.
- **Sick** — Ill or weakened; −2 to Physical actions; may worsen.
- **Stunned** — Lose next action (mirrors the Condition of the same name but is scene-bound here).

### 4.3 Environmental Tilts (Core)

Affect everyone in the scene.

- **Blizzard** — Heavy snow & wind; −3 to ranged & Perception; movement halved.
- **Earthquake** — Shaking ground; Dex+Athletics or fall (Knocked Down).
- **Extreme Cold** — Lethal exposure; lose Stamina-based resistance roll or take Bashing.
- **Extreme Heat** — As Cold but heat-based; dehydration imposes *Deprived*.
- **Flooded** — Standing/rushing water; Speed halved or swim rolls required.
- **Heavy Rain** — −2 to Perception and ranged; surfaces slippery.
- **Heavy Winds** — −2 to ranged; light objects become hazards.
- **Ice** — Slippery footing; Dex+Athletics to avoid Knocked Down on sudden moves.
- **Darkness** — Heavy/total: −3 or auto-fail sight rolls; combat at penalty.

---

## 5. Proposed JSON Data Shape

### 5.1 Catalog file: `resources/conditions.json`

A single object keyed by the slug. Loaded at plugin startup and cached.

```json
{
  "shaken": {
    "name": "Shaken",
    "key": "shaken",
    "persistent": false,
    "description": "Recent fright has rattled the character.",
    "effect": "Lose 1 Willpower point if forced to confront the source again this scene.",
    "resolution": "Confront the source successfully, or flee the scene entirely.",
    "beats": 1,
    "category": "condition"
  },
  "addicted": {
    "name": "Addicted",
    "key": "addicted",
    "persistent": true,
    "description": "The character is hooked on a substance or behavior and suffers when deprived.",
    "effect": "Without a fix, −2 to all rolls and lose 1 Willpower per scene of withdrawal.",
    "resolution": "Complete a sustained recovery arc, or hit rock bottom in a scene.",
    "beats": 1,
    "category": "condition"
  },
  "knocked-down": {
    "name": "Knocked Down",
    "key": "knocked-down",
    "persistent": false,
    "description": "The character is prone.",
    "effect": "−2 to attack; attackers gain +2 in close combat. Spend an action to stand.",
    "resolution": "Scene ends, or character spends an action to stand.",
    "beats": 0,
    "category": "tilt-personal"
  },
  "heavy-rain": {
    "name": "Heavy Rain",
    "key": "heavy-rain",
    "persistent": false,
    "description": "Driving rain reduces visibility and grip.",
    "effect": "−2 to Perception and ranged attacks; slippery surfaces.",
    "resolution": "Scene ends or weather clears.",
    "beats": 0,
    "category": "tilt-environmental"
  }
}
```

### 5.2 `category` field

- `"condition"` — Standard Condition (eligible for Beats, may be Persistent).
- `"tilt-personal"` — Per-character Tilt (scene-bound, no Beats).
- `"tilt-environmental"` — Scene-wide Tilt (scene-bound, no Beats).

### 5.3 Per-character storage

Active Conditions/Tilts live on the player object at `state.cofd.conditions` (array). Each entry references the catalog key and records runtime metadata:

```json
"conditions": [
  {
    "key": "shaken",
    "appliedAt": "2026-05-19T20:14:00Z",
    "appliedBy": "#12",
    "source": "Witnessed the body in the alley",
    "notes": ""
  }
]
```

### 5.4 Aspirations storage

Separate array at `state.cofd.aspirations` (see §1.3). Validation: max 3 active, each entry has `id`, `text`, `term` (`"short"` | `"long"`), and `createdAt`.

### 5.5 Beat ledger

When a Condition resolves, the system appends a Beat entry to `state.cofd.beats` (array of `{ ts, source, amount }`). Every 5 Beats auto-convert to 1 Experience at session end (or on demand), per CoFD 2e core.

---

## 6. Implementation Notes for the Plugin

- **Catalog source of truth**: `resources/conditions.json` (this spec's §5.1 shape). Hot-reloadable.
- **Commands** (to be defined in a later design pass; out of scope here): `+condition`, `+condition/add`, `+condition/resolve`, `+tilt`, `+aspiration`, `+aspiration/fulfill`.
- **Permission model**: Players may add/resolve Conditions on themselves; STs (`isAdmin` or builder+) may target other characters. Use `await u.canEdit(u.me, target)` per CLAUDE.md conventions.
- **DBO writes**: All writes go through `u.db.modify(id, "$set" | "$unset" | "$inc", data)` against `state.cofd.*` paths.
- **Beat awards**: On `+condition/resolve`, append to Beat ledger and notify the player; do not auto-grant XP until 5 Beats accumulate (or session-end batch).

---

*End of specification.*
