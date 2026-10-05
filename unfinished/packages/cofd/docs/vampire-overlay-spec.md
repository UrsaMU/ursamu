# Vampire: The Requiem 2nd Edition — Overlay Specification

**Target:** UrsaMU CoFD Plugin (Vampire template overlay)
**Source canon:** *Vampire: The Requiem*, 2nd edition (Onyx Path / White Wolf, 2013), Chronicles of Darkness 2e core compatible.
**Purpose:** Drive implementation of `templates/vampire.json` and the Vampire-specific extension of `+sheet`, `+roll`, and chargen routes.

---

## 1. Clans

Vampires belong to one of five great clans. Each clan grants two signature Disciplines (in-clan, learned at standard XP cost), favored attribute/skill leanings, and bears a unique Bane (the clan curse, an always-on disadvantage). All clans use **Blood** as the resource and **Humanity** as the morality track.

Reference: *V:tR 2e*, Chapter Two — "The Damned."

| Clan | Signature Disciplines | Favored Attributes | Favored Skills | Bane (Clan Curse) |
|------|----------------------|---------------------|----------------|-------------------|
| **Daeva** | Celerity, Majesty | Dexterity, Manipulation | Persuasion, Socialize, Subterfuge | *The Wanton Curse:* Cannot spend Willpower to resist a temptation tied to their Mask/Dirge vice; succumb to obsessive desire. |
| **Gangrel** | Animalism, Protean | Stamina, Composure | Animal Ken, Athletics, Survival | *The Savage Curse:* Lose 1 die from all Mental and Social pools while frenzying or when failing to resist frenzy. |
| **Mekhet** | Auspex, Obfuscate | Wits, Intelligence | Investigation, Occult, Stealth | *The Shadow Curse:* Suffer one extra point of aggravated damage from sunlight and fire; Auspex / supernatural senses to detect them gain +2 dice. |
| **Nosferatu** | Nightmare, Vigor | Strength, Resolve | Brawl, Intimidation, Stealth | *The Lonely Curse:* Inflict the **Bestial** Condition by mere presence; cannot take 10-again on Social rolls to make others comfortable. |
| **Ventrue** | Dominate, Resilience | Resolve, Presence | Politics, Persuasion, Expression | *The Tyrant's Curse:* Each story, suffer one new persistent Condition (e.g., *Embarrassing Secret*, *Delusional*) reflecting cracks in the mind from feeding on power. |

**Flavor lines (1 each):**
- **Daeva** — *Serpents.* Hedonist seducers whose hungers are as alluring as they are fatal.
- **Gangrel** — *Savages.* Half-beast nomads who walk the line between predator and animal.
- **Mekhet** — *Shadows.* Scholar-spies of the dead, custodians of forbidden lore.
- **Nosferatu** — *Haunts.* Monstrous outsiders who weaponize fear and isolation.
- **Ventrue** — *Lords.* Aristocratic rulers whose grip on power slowly poisons the mind.

---

## 2. Covenants

The five major covenants are political/religious factions. Each grants access to a covenant-specific mystical practice (or Coils) at chargen and through XP. Reference: *V:tR 2e*, Chapter Three — "Covenants."

| Covenant | Identity (1-sentence) | Covenant Mechanic |
|----------|----------------------|--------------------|
| **Carthian Movement** | Revolutionary modernists trying to fuse mortal political theory (democracy, anarchism, fascism, etc.) with the Requiem. | **Carthian Law** — domain-wide ritual laws ratified by the Carthians that grant tangible mechanical bonuses (e.g., +2 dice to a specific Skill) to vampires who uphold them, and impose penalties on violators. |
| **Circle of the Crone** | Pagan mystery cult worshipping pre-monotheistic mother and crone deities, embracing the curse as sacred. | **Crúac** — blood sorcery. Discipline-like ritual list (dots 1–5). Casting roll: *Stamina + Occult + Crúac dots*, costs Vitae per dot of ritual; failure can inflict the **Wanton** Condition. |
| **Invictus** | The First Estate; feudal aristocracy of secret oaths, traditions, and pyramid-of-power politics. | **Oaths of the Invictus** — binding supernatural contracts (Oath of Serfdom, Oath of Fealty, etc.) that grant or revoke standing and inflict Conditions on oath-breakers. |
| **Lancea et Sanctum** | Damned Christian church teaching that vampires are God's dark angels, sent to test mortals and refine the faithful. | **Theban Sorcery** — divine blood miracles. Ritual list (dots 1–5). Casting roll: *Stamina + Academics + Theban Sorcery dots*; cost is a **tithe** (a relevant sin/sacrifice) rather than pure Vitae. |
| **Ordo Dracul** | Esoteric order founded by Dracula himself, dedicated to transcending the curse through self-mastery and arcane study. | **Coils of the Dragon** — five Mysteries (Coil of the Beast, Blood, Banes, Voivode, Wyrm) each with 5 tiers; permanently rewrite a piece of vampiric "physics" (e.g., Coil of Banes mitigates clan Bane at tier 5). Also gain access to **Scales of the Dragon** — minor refinements. |

---

## 3. Disciplines

Disciplines are the supernatural powers of the Kindred. Common Disciplines are clan-aligned; covenant Disciplines (Crúac, Theban Sorcery) and the Coils are restricted by covenant. All Discipline rolls in 2e use the **8-again** rule by default unless a specific power upgrades or downgrades that rerolling threshold.

Reference: *V:tR 2e*, Chapter Four — "Disciplines."

### 3.1 Common Disciplines

#### Animalism — *Command and commune with animals and the Beast itself.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1 | Feral Whispers | — (reflexive) | Manipulation + Animal Ken + Animalism |
| 2 | Obedience | 1 Vitae | Presence + Animal Ken + Animalism vs Composure + BP |
| 3 | Call of the Hunt | 1 Vitae | Presence + Animal Ken + Animalism |
| 4 | Sense the Beast | — | Wits + Empathy + Animalism vs Composure + BP |
| 5 | Hellgate / Punish the Lash of Sin | 2 Vitae | Manipulation + Animal Ken + Animalism vs Resolve + BP |

#### Auspex — *Heightened senses, aura sight, and psychic perception.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1 | Beast's Hackles | — (reflexive) | Wits + Empathy + Auspex |
| 2 | Uncanny Perception | — | Wits + Empathy + Auspex |
| 3 | The Spirit's Touch | 1 Willpower | Wits + Occult + Auspex |
| 4 | Lay Open the Mind | 1 Vitae | Intelligence + Empathy + Auspex vs Resolve + BP |
| 5 | Twilight Projection | 1 Willpower | Intelligence + Occult + Auspex |

#### Celerity — *Preternatural speed and reflexes.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1–5 | Each dot of Celerity adds its rating to **Defense** and to **Initiative**, and permits running at multiplied Speed. | 1 Vitae to "ignite" for one scene (reflexive). | None — flat numeric bonus. Reflexive activation lets you take an extra Move action per turn while Celerity is active. |

#### Dominate — *Issue mental commands; rewrite memory.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1 | Mesmerize | — | Intelligence + Expression + Dominate vs Resolve + BP |
| 2 | Iron Edict | 1 Willpower | Intelligence + Intimidation + Dominate vs Resolve + BP |
| 3 | Entombed Command | 1 Vitae | Manipulation + Intimidation + Dominate vs Resolve + BP |
| 4 | The Forgetful Mind | 1 Vitae | Intelligence + Persuasion + Dominate vs Resolve + BP |
| 5 | Possession | 1 Willpower + 1 Vitae | Intelligence + Intimidation + Dominate vs Resolve + BP (extended) |

#### Majesty — *Awe-inspiring presence and emotional control.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1 | Awe | — | Presence + Expression + Majesty vs Composure + BP |
| 2 | Confidant | 1 Willpower | Manipulation + Persuasion + Majesty vs Composure + BP |
| 3 | Green Eyes | — | Manipulation + Subterfuge + Majesty vs Composure + BP |
| 4 | Loyalty | 1 Vitae | Presence + Persuasion + Majesty vs Composure + BP |
| 5 | Idol | 1 Willpower | Presence + Expression + Majesty (area) |

#### Nightmare — *Inflict terror, hallucinations, and dread.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1 | Imposter's Guise / The Face of Fear | — | Presence + Intimidation + Nightmare vs Resolve + BP |
| 2 | Dread Reputation | 1 Vitae | Manipulation + Intimidation + Nightmare |
| 3 | Eyes of the Beast | 1 Vitae | Presence + Intimidation + Nightmare vs Composure + BP |
| 4 | Mortal Fear | 1 Willpower | Presence + Intimidation + Nightmare vs Resolve + BP |
| 5 | The Cackle | 1 Vitae + 1 WP | Presence + Intimidation + Nightmare (area) |

#### Obfuscate — *Hide from senses; cloud minds.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1 | Touch of Shadow | — | Wits + Stealth + Obfuscate (contested by Wits + Composure) |
| 2 | Cloak of Night | — | Wits + Stealth + Obfuscate |
| 3 | Familiar Stranger | 1 Vitae | Manipulation + Subterfuge + Obfuscate |
| 4 | Oubliette | 1 Vitae | Wits + Stealth + Obfuscate vs Resolve + BP |
| 5 | The Madness of Crowds | 1 Willpower | Wits + Stealth + Obfuscate |

#### Praestantia — *Unnatural precision and grace (often associated with Julii bloodlines).*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1–5 | Each dot adds its rating to **Dexterity** for the scene when ignited; also raises the cap on Dexterity-based Skills by its rating. | 1 Vitae (scene). | Flat bonus. |

#### Protean — *Shape-shifting and bestial transformation.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1 | The Beast Unleashed | — (reflexive) | Stamina + Survival + Protean |
| 2 | Claws of the Wild | 1 Vitae | Reflexive; claws inflict L damage, +0L weapon rating climbing each dot. |
| 3 | Unmarked Grave | 1 Vitae | Stamina + Survival + Protean (merge with earth) |
| 4 | Aspect of the Predator | 1 Vitae | Wits + Athletics + Protean (animal form) |
| 5 | Body of Spirit / Devouring the Soul | 2 Vitae | Stamina + Survival + Protean |

#### Resilience — *Supernatural toughness.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1–5 | Each dot adds its rating to **Stamina** when ignited and downgrades incoming aggravated damage to lethal at higher dots (per power line). | 1 Vitae (scene). | Flat bonus. |

#### Vigor — *Supernatural strength.*
| Dot | Power | Cost | Dice Pool |
|-----|-------|------|-----------|
| 1–5 | Each dot adds its rating to **Strength** when ignited; increases Brawl damage and lifting capacity. | 1 Vitae (scene). | Flat bonus. |

### 3.2 Covenant Disciplines

#### Crúac — *Blood-witchcraft of the Circle of the Crone.*
- **Summary:** Ritual sorcery list; rituals are individually purchased and rated by dots (1–5).
- **Casting roll:** *Stamina + Occult + Crúac dots*, penalty equal to ritual rating × 2 (or per ritual entry).
- **Cost:** 1 Vitae per dot of ritual, paid up front. Failure may inflict the **Wanton** or **Shaken** Condition.
- **Examples by dot:** 1 *Pangs of Proserpina*, 2 *Blood Scourge*, 3 *Curse of Aphrodite*, 4 *Touch of the Morrigan*, 5 *Theft of Vitae*.

#### Theban Sorcery — *Divine miracles of the Lancea et Sanctum.*
- **Summary:** A miracle/ritual list (1–5), invoked as acts of dark faith.
- **Casting roll:** *Stamina + Academics + Theban Sorcery dots*.
- **Cost:** A **tithe** — a thematic offering or sacrifice scaled to ritual rating (e.g., a confessed sin, destruction of a holy object, a willing victim) in lieu of straight Vitae.
- **Examples by dot:** 1 *Vitae Reliquary*, 2 *Apple of Eden*, 3 *Trials of Job*, 4 *Stigmata*, 5 *Damnation*.

---

## 4. Banes (Quick Reference)

| Clan | Bane Summary |
|------|--------------|
| Daeva | Cannot use Willpower to resist a temptation tied to Vice; obsession ensues. |
| Gangrel | −1 die to Mental & Social pools while frenzying or failing frenzy resistance. |
| Mekhet | +1 aggravated from sunlight/fire; +2 dice to others' Auspex/detection rolls. |
| Nosferatu | Inflict **Bestial** by presence; no 10-again on social-comfort rolls. |
| Ventrue | Gain a new persistent Condition each story reflecting psychological cracks. |

---

## 5. Touchstones

Reference: *V:tR 2e*, "Humanity & Touchstones."

- **Definition:** A Touchstone is a specific mortal — a person, place, or thing tied to a person — that anchors the vampire to their lost humanity.
- **Count:** A vampire has **two Touchstones**, one tied to each face of their identity:
  - **Mask Touchstone (Anchor):** Tied to the vampire's public persona and **Mask Virtue**; keeps the vampire engaged with mortal society.
  - **Dirge Touchstone (Wanderer / Ideal):** Tied to the vampire's true predatory self and **Dirge Vice**; keeps the vampire feeling, even in monstrous form.
- **Mechanical effects:**
  - When a Touchstone is *intact and engaged*, the vampire may regain Willpower by acting on Mask or Dirge as appropriate.
  - When a Touchstone is *threatened*, attempting an action against it forces a **breaking point** check (see Humanity).
  - **Losing a Touchstone** (death, betrayal, severance) immediately lowers Humanity by 1 unless a degeneration roll succeeds; replacing one takes story-time and roleplay.
- **Link to Humanity loss:** Touchstones cap the practical depth of degeneration — without Touchstones, a vampire cannot meaningfully refuse the slide of Humanity below current rating.

---

## 6. Vitae

Reference: *V:tR 2e*, "The Blood."

Vitae is the vampire's blood resource, drawn from feeding. One Vitae = one point of stored blood. Per-turn spending is capped by Blood Potency (see §7).

**Standard Vitae expenditures (1 Vitae unless noted):**
| Expenditure | Effect |
|-------------|--------|
| Heal 1 bashing damage | Reflexive; instant. |
| Heal 1 lethal damage | 1 Vitae per point, one turn each. |
| Heal 1 aggravated damage | 5 Vitae + 1 Willpower; takes one full day of rest. |
| Boost a Physical Attribute | +2 to one Physical Attribute (Str/Dex/Sta) for one scene. |
| Power a Discipline | As listed in each Discipline power. |
| **Blush of Life** | 1 Vitae; for one hour appear human (warm, can eat/breathe/sex). |
| Wake at sunset | 1 Vitae automatically siphoned each night to rise. |
| Awaken from torpor | Cost varies by Blood Potency and torpor depth (1+ Vitae and Resolve + Composure roll). |
| Create a ghoul | 1 Vitae fed to mortal grants a month of Vitae addiction + minor power. |
| Embrace | All but one Vitae drained + return one Vitae to mortal at point of death. |

**Per-turn spend limit:** capped by Blood Potency table (§7). Above-cap spends require successive turns.

---

## 7. Blood Potency

Reference: *V:tR 2e*, "Blood Potency." Blood Potency (BP) rises with age, diablerie, and torpor.

| BP | Max Vitae (Pool) | Max Vitae per Turn | Min Humanity Required to Sustain | Blood Required to Slake Hunger |
|----|------------------|---------------------|----------------------------------|--------------------------------|
| 0  | 10 | 1 | — | Animal, human, vampire — any blood. (Newly-Embraced before first feeding; effectively human BP.) |
| 1  | 10 | 1 | — | Animal, human, vampire. |
| 2  | 11 | 2 | — | Human, vampire (animal no longer slakes hunger). |
| 3  | 12 | 3 | — | Human, vampire. |
| 4  | 13 | 4 | — | Human, vampire. |
| 5  | 14 | 5 | 7 or less | Vampire blood now slakes more; human blood losing efficiency. |
| 6  | 15 | 6 | 6 or less | Must feed from humans of strong Vice/Virtue or Kindred. |
| 7  | 20 | 7 | 5 or less | Vampire vitae becomes near-required; mortal blood barely satisfies. |
| 8  | 30 | 8 | 4 or less | Vampire blood preferred; must hunt Kindred or supernaturals to truly slake. |
| 9  | 50 | 9 | 3 or less | Almost exclusively Kindred vitae. |
| 10 | 75 | 10 | 2 or less | Only the eldest or supernatural blood satisfies; near-mythic monster. |

Notes:
- **Min Humanity** column reflects the *ceiling* placed on Humanity by high BP (Humanity cannot exceed `10 − (BP − 4)` for BP ≥ 5 in 2e common-house ruling; the table reflects RAW 2e where high BP imposes Humanity caps).
- **Hunger slaking:** At BP 2+, animal blood slakes 0 Vitae. At BP 6+, only Vice/Virtue-driven mortal blood or vampire vitae slakes more than 1 Vitae per drink.
- BP 0 is the **freshly-Embraced** state before first feeding; BP can also temporarily *drop* via torpor.

---

## 8. Humanity

Reference: *V:tR 2e*, "Humanity & Breaking Points."

- **Replaces Integrity** for vampires. Starts at **7** for most new vampires (Storyteller may vary at Embrace).
- **Range:** 0 (true monster, often a draugr) to 10 (effectively still mortal in soul).
- **Function:** Caps social interaction with mortals, throttles BP gain, and gates access to certain rituals/Coils.

### Breaking points (vampire-specific)
A vampire rolls a breaking point — *Resolve + Composure*, modified by current Humanity and the act — when they:
1. Feed in a way that violates their Mask Touchstone's ideal.
2. Commit acts of unprovoked violence against mortals.
3. Diablerize another Kindred (always at a steep penalty; near-automatic Humanity loss).
4. Witness or commit supernatural atrocities (e.g., uses of forbidden Crúac/Theban that breach human dignity).
5. Lose or destroy a Touchstone.
6. Slumber past a season without an anchor's reminder of mortality.

**Modifier guide:**
| Humanity | Modifier to breaking-point roll |
|----------|----------------------------------|
| 8–10 | +2 / +1 (acts feel monstrous; easier to resist BP, harder to ignore guilt) |
| 6–7  | 0 |
| 4–5  | −1 |
| 2–3  | −2 |
| 0–1  | −3 (rolls only on the most extreme provocations; Beast nearly dominant) |

Roll results:
- **Success:** Humanity holds; gain a relevant Persistent Condition (e.g., *Guilty*, *Shaken*).
- **Failure:** Lose 1 Humanity dot; gain *Mortified* or worse.
- **Dramatic Failure:** Lose 1 Humanity, gain *Fugue* or a flat detachment Condition; risk immediate frenzy.
- **Exceptional Success:** Humanity holds and the vampire gains *Inspired* or *Steadfast*.

**Touchstone link:** While both Touchstones are intact, breaking point rolls re-roll 9s and 10s (effective 9-again). With one Touchstone lost, drop to standard 10-again. With no Touchstones, the vampire suffers −2 dice on all breaking-point rolls and cannot regain Humanity through experiences.

---

## 9. Predatory Aura

Reference: *V:tR 2e*, "The Predatory Aura."

The Predatory Aura is the supernatural "presence" of the Beast bleeding out. It is the contested social signature of every Kindred.

- **Activation:** Reflexive when feeding, frenzying, or by deliberate choice (no cost) to *project* the aura.
- **Dice pool to project:** *Presence + Intimidation + Blood Potency*.
- **Resistance pool:** *Composure + Blood Potency* (vampires) or *Composure + Supernatural Tolerance* (other supernaturals); mortals roll *Composure* alone, often at −BP penalty.
- **Contest:** Standard CoFD contested roll; success forces a target Condition based on the aura "flavor" chosen by the projector.

### Conditions imposed by Predatory Aura
| Flavor | Condition | Effect (summary) |
|--------|-----------|------------------|
| Hungry / Feeding | **Bestial** | Target is suddenly viscerally afraid; −2 dice to Social rolls vs. projector until end of scene. |
| Awe / Allure | **Charmed** | Target is fascinated; cannot take hostile action without spending Willpower. |
| Wrath / Anger | **Cowed** | Target may not initiate violence against projector this scene without spending Willpower. |
| Terror | **Wanton** | Target suffers Beast-driven distraction; loses Defense vs. projector until they act decisively. |
| Predator (steady gaze) | **Competitive** | Lower-BP vampires must accept hierarchy or contest Predatory Aura with their own. |

Notes:
- A vampire **must roll Predatory Aura on first hostile encounter with another Kindred each scene** unless both spend Willpower to suppress.
- Higher-BP projector vs. lower-BP target always wins ties.
- Frenzy automatically triggers and broadcasts the aura at full BP.

---

## 10. The Beast and Frenzy

Reference: *V:tR 2e*, "The Beast / Frenzy."

The Beast is the predatory soul fused to the vampire at Embrace. Frenzy is its takeover.

### Frenzy triggers (the Three Hungers)
| Trigger | Cause | Common Stimulus |
|---------|-------|------------------|
| **Hunger Frenzy** | Vitae pool low (typically ≤ 1 Vitae, or scent of blood when at half pool). | Smell of fresh blood, sight of mortal wound, low Vitae. |
| **Anger Frenzy** | Insult, attack, or violation of the vampire's authority/territory. | Physical assault, profound humiliation, threatened Touchstone. |
| **Terror Frenzy (Rötschreck)** | Fear of true destruction. | Sunlight, fire, true faith, threat of final death. |

### Resistance roll
**Pool:** *Resolve + Composure*, modified per trigger and per scene.

| Modifier | Source |
|----------|--------|
| +2 | Distant or symbolic stimulus (a candle for terror, a slap for anger). |
| 0  | Standard provocation (open flame in the room, a punch). |
| −2 | Direct contact (skin in flame, blood in mouth). |
| −3 to −5 | Overwhelming stimulus (sunrise, mass casualty wound). |
| ±X | Apply current **Humanity** modifier (high Humanity helps resist; low Humanity makes frenzy easier to fall into but easier to *ride*). |

Result interpretation:
- **Success:** Resist frenzy for the turn / scene.
- **Failure:** Enter frenzy; lose control (ST or table guidance on actions). Vampire cannot spend Willpower on social pools, gains +2 to Physical pools, and ignores wound penalties.
- **Dramatic Failure:** Immediate frenzy with no chance to ride; lasts full scene minimum.
- **Exceptional Success:** Resist *and* gain **Steadfast** or a similar +2-dice Condition tied to mastery of the Beast.

### Riding the Wave
A vampire may choose to *ride* a frenzy: spend 1 Willpower and act with frenzy-style bonuses while retaining a single objective ("kill that person", "flee the fire"). Failure to ride means full frenzy.

### Detachment
Repeated frenzy without consequence accelerates Humanity loss; each scene-long frenzy without breaking-point review at session end forces a Resolve + Composure check next session at −1 die.

---

## Appendix A — Implementation Notes (for templates/vampire.json)

The JSON template should expose the following top-level keys consumed by the CoFD plugin overlay:

```
{
  "clans": [...5 entries: name, disciplines[2], banes, flavor, favored_attrs[], favored_skills[]],
  "covenants": [...5 entries: name, identity, mechanic_name, mechanic_type],
  "disciplines": {
    "common": [...11 entries: name, summary, powers[1..5], cost_per_dot, pool_formula],
    "covenant": [...2 entries: Crúac, Theban Sorcery]
  },
  "blood_potency_table": [...11 rows BP 0..10],
  "vitae_costs": [...named effects + cost + scope],
  "humanity": { "default_start": 7, "breaking_points": [...], "modifier_table": [...] },
  "predatory_aura": { "project_pool": "Presence+Intimidation+BP", "conditions": [...] },
  "frenzy": { "triggers": [...3], "resist_pool": "Resolve+Composure", "modifier_table": [...] },
  "touchstones": { "count": 2, "kinds": ["Mask","Dirge"], "loss_consequences": [...] }
}
```

### Sheet (`+sheet`) extensions
- Show **Blood Potency**, **Vitae (current / max)**, **Humanity (current / max)**, **Mask** virtue / **Dirge** vice, two Touchstones, clan, covenant, bloodline (optional), Discipline list with dots, covenant-mechanic list (Crúac/Theban rituals, Carthian Laws, Coils, Oaths).

### Roll (`+roll`) extensions
- Recognize `+roll discipline/<name>` and pull pool formula from this spec.
- Recognize `+roll frenzy[/anger|/hunger|/terror]` and apply modifier table.
- Recognize `+roll predatoryaura` and compute `Presence + Intimidation + BP`.
- Recognize `+roll breakingpoint` and apply Humanity modifier and Touchstone status.

### Chargen (`+chargen`) extensions
- Force selection of Clan (assigns 2 in-clan Disciplines) and Covenant (unlocks covenant mechanic list).
- Default starting **Blood Potency 1**, **Humanity 7**, **Vitae = full per BP table**.
- Two Touchstones required to finalize sheet; otherwise template stays in `pending` state.

---

*End of specification — Vampire: The Requiem 2e overlay.*
