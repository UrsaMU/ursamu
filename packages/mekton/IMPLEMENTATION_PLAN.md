# Mekton Zeta — UrsaMU Plugin Implementation Plan

## Status: COMPLETE (P1–P11)

## Source material
- `/Users/kumakun/Documents/Mekton/mekton-zeta-core.txt` — character generation, stats, skills, lifepath, professions, rookies, equipment
- `/Users/kumakun/Documents/Mekton/mekton-zeta-plus.txt` — MTS mecha construction, scaling, psionics, advanced rules

## Stages
- [x] Stage 0 — Design confirmed by user
- [x] Stage 1 — Code generated
- [x] Stage 2 — Audit passed
- [x] Stage 3 — Refined
- [x] Stage 4 — Tests passing (14 suites, 33 steps)
- [x] Stage 5 — Docs complete

## Open decisions
- Stat generation method: support all three (random / concept / cinematic) or only concept (standard)?
- Lifepath: fully automated roll-and-record, or guided interactive flow?
- Psionics (Mekton Plus): phase 1 scope or deferred to phase 2?
- Mecha construction (MTS): separate plugin or same plugin, separate phase?
- Interlock dice roller: `+roll` command in chargen plugin or standalone plugin?
- Gear catalog: full static catalog baked into plugin, or staff-extensible at runtime?

## Lessons learned
- (none yet)

---

## Build Order

| Phase | Feature | Commands | Status |
|-------|---------|----------|--------|
| P1 | Stats + chargen scaffolding | `+chargen`, `+chargen/start`, `+chargen/stat`, `+chargen/method` | pending |
| P2 | Skills | `+chargen/skill`, `+chargen/skills` | pending |
| P3 | Lifepath (basic, to age 16) | `+chargen/lifepath`, `+chargen/roll-lifepath` | pending |
| P4 | Character type: Rookie templates | `+chargen/type`, `+chargen/template` | pending |
| P5 | Character type: Professions | `+chargen/career`, `+chargen/career-list` | pending |
| P6 | Submit / approve / reject | `+chargen/submit`, `+chargen/approve`, `+chargen/reject` | pending |
| P7 | Gear catalog + encumbrance | `+gear`, `+gear/buy`, `+gear/catalog`, `+encumbrance` | pending |
| P8 | Interlock dice roller | `+roll` | pending |
| P9 | Sheet display | `+sheet` | pending |
| P10 | Personal combat | `+attack`, `+damage`, `+heal`, `+stun` | pending |
| P11 | AI GM bridge | `IGameSystem` + `gm:system:register` | pending |
| P12 | Psionics (Mekton Plus) | `+chargen/psi` | deferred |
| P13 | Mecha construction (MTS) | separate phase | deferred |

---

## P1: Stats + Chargen Scaffolding

### DB Schema

```typescript
// mekton.chars collection
interface IMektonChar {
  id: string;
  playerId: string;
  playerName: string;

  // ── Primary stats (2–10, average 6) ───────────────────────
  stats: {
    att:  number;   // Attractiveness
    bod:  number;   // Body Type
    cl:   number;   // Cool
    emp:  number;   // Empathy
    int:  number;   // Intelligence
    luck: number;   // Luck (per-session point pool)
    ma:   number;   // Movement Allowance
    ref:  number;   // Reflexes
    tech: number;   // Technical Ability
    edu:  number;   // Education (substat of INT; bought like a stat)
  };

  // ── Skills: { "Mecha Piloting": 3, "Handgun": 2, ... } ────
  skills: Record<string, number>;

  // ── Lifepath ───────────────────────────────────────────────
  lifepath: {
    socialStatus: number;           // 1–10 (determines starting cash table)
    startingCash: number;           // ¥ from social status table
    parentStatus: string;           // A2/A3/A4 result label
    familyStanding: "good" | "bad";
    familyCrisis?: string;          // C chart result, if bad standing
    familialGoal?: string;          // D chart result, if crisis
    siblings: ILifepathSibling[];
    friends: ILifepathFriend[];
    enemies: ILifepathEnemy[];
    romance: IRomance | null;
    // Appearance / personality traits
    appearance: {
      hairColor: string;
      hairStyle: string;
      eyeColor: string;
      personalityTrait: string;
      valueMost: string;
      valuedPossession: string;
      valuedPerson: string;
    };
    // Professional-era events (one per 2-year term)
    professionalEvents: ILifepathEvent[];
  };

  // ── Character type ─────────────────────────────────────────
  charType: "rookie" | "professional" | null;  // null = not yet chosen

  // Rookie
  rookieTemplate: string | null;

  // Professional: one entry per 2-year career term (max 7 terms, age 16→30)
  careers: ICareerTerm[];

  // ── Age ────────────────────────────────────────────────────
  age: number;     // 16–30 for professionals; 16–20 for rookies

  // ── Equipment ──────────────────────────────────────────────
  equipment: IEquipmentItem[];
  cash: number;   // current ¥ balance

  // ── Stat generation method ─────────────────────────────────
  statMethod: "random" | "concept" | "cinematic" | null;
  statPointPool: number | null;  // remaining points for concept/cinematic

  // ── Chargen status ─────────────────────────────────────────
  chargenStatus: "draft" | "submitted" | "approved" | "revision";
  submittedAt?: number;
  approvedAt?: number;
  reviewNote?: string;   // staff note on reject
}

interface ILifepathSibling {
  gender: "male" | "female";
  relativeAge: "older" | "younger" | "twin";
  feeling: "dislikes" | "likes" | "neutral" | "hero-worships" | "hates";
}

interface ILifepathFriend {
  gender: "male" | "female";
  type: string;   // "old school pal", "mentor", "ex-lover", etc.
}

interface ILifepathEnemy {
  type: string;        // "old friend", "relative", "government official", etc.
  causeOfHatred: string;
  whoHates: "them" | "you" | "mutual";
  reaction: string;    // "rage and tries to kill", "avoids", "ignores", etc.
}

interface IRomance {
  status: "involved" | "uninvolved" | "recovering";
  detail: string;   // H1/H2/H3 result
}

interface ILifepathEvent {
  term: number;          // which career term (1, 2, 3…)
  profession: string;
  dangerous: boolean;
  event: string;         // narrative label (windfall, friend, enemy, accident, etc.)
  detail: string;
  accidentEffect?: {     // Q results that modify stats
    stat: "att" | "ref";
    delta: number;
  };
}

interface ICareerTerm {
  profession: string;     // "Mechajock (Combat)", "Soldier/Mercenary", etc.
  dangerous: boolean;
  chosenSkills: string[]; // 5 of the 7 listed — each gets +1
  equipmentBonus: number; // 2D10¥ per term
}

interface IEquipmentItem {
  name: string;
  weight: number;   // kg
  cost: number;     // ¥
  notes?: string;
}
```

### Commands (P1 scope)

| Command | Pattern | Lock | Description |
|---------|---------|------|-------------|
| `+chargen` | `/^\+chargen$/i` | connected | View chargen sheet / status |
| `+chargen/start` | `/^\+chargen\/start$/i` | connected | Begin chargen (creates draft) |
| `+chargen/method <m>` | `/^\+chargen\/method\s+(.*)/i` | connected | Set stat generation method |
| `+chargen/stat <s>=<v>` | `/^\+chargen\/stat\s+(.+)=(.+)/i` | connected | Set a primary stat |
| `+chargen/roll` | `/^\+chargen\/roll$/i` | connected | Roll stats (random/concept) |

### Derived stat formulas (computed, never stored)

```
Head HP:   BOD 2→4H, 3-4→5H, 5-7→6H, 8-9→7H, 10→8H
Torso HP:  BOD 2→8H, 3-4→10H, 5-7→12H, 8-9→14H, 10→16H
Limb HP:   BOD 2→6H, 3-4→7H, 5-7→9H, 8-9→10H, 10→12H
Stun:      BOD 2→4, 3-4→5, 5-7→6, 8-9→7, 10→8
Lift:      BOD 2→20kg, 3-4→40kg, 5-7→60kg, 8-9→90kg, 10→120kg
Throw:     BOD 2→6m, 3-4→12m, 5-7→20m, 8-9→26m, 10→30m
DmgBonus:  BOD 2→-2, 3-4→-1, 5-7→0, 8-9→+1, 10→+2
EV:        BOD 2→2, 3-4→2, 5-7→4, 8-9→6, 10→8
Stability: floor(CL × 2.5)
SkillPts:  INT + EDU + 10
```

### Invariants
- Every stat must be 2–10
- Concept method: total stat points = pool (10D10 result, min 40); spending may not exceed pool
- Random method: re-roll any stat that comes up 1; re-roll entire character if total < 40
- Cinematic: pool assigned by staff (55/60/65/70/75/80)
- Stat total must be ≥ 10 across all 10 stats (10 × min 2 = 20 absolute floor)
- Once approved, all stat commands are blocked

---

## P2: Skills

### Skill catalog (stat → skill name → [H] flag)

```
ATT: Personal Grooming, Wardrobe & Style
CL:  Interrogation[H], Intimidate[H], Persuasion & Fast Talk[H],
     Resist Torture/Drugs[H], Streetwise
EMP: Acting, Human Perception, Interview, Leadership, Seduction, Social
INT: Awareness/Notice, Compose or Write, Disguise, Expert[specify],
     Gamble[H], Know Language[specify], Programming[H],
     Shadowing/Avoid Pursuit[H], Survival, Teaching[H]
REF (personal): Automatic Weapon, Blade, Dodge & Escape, Handgun,
                Hand to Hand, Rifle
REF (mecha):    Mecha Fighting[H], Mecha Gunnery[H], Mecha Melee[H],
                Mecha Missiles[H], Mecha Piloting[H]
REF (non-cbt):  Aircraft/Aeroshuttle Pilot[H], Athletics, Dance,
                Driving, Stealth[H], Swimming, Zero Gee
TECH: Basic Repair, First Aid, Jury Rig, Mecha Design[H], Mecha Tech[H],
      Medical[H], Paint or Draw, Photography & Film, Pick Lock[H],
      Pickpocket[H], Play Musical Instrument, Sing
```

### Skill cost rules
- +1 to +5: 1 point per level
- +6 to +10: 2 points per level above 5 (i.e. +8 costs 5 + (3×2) = 11 total)
- Hard [H] skills: max +5 at character creation (professionals can exceed via career bonuses)

### Commands (P2 scope)
| Command | Description |
|---------|-------------|
| `+chargen/skill <name>=<level>` | Set a skill to a specific level |
| `+chargen/skills` | List remaining skill points and current skill selections |

### Invariants
- Total skill points spent ≤ INT + EDU + 10
- [H] skills may not exceed +5 at start (career bonuses may exceed this cap)
- Skill names must be in the catalog (or "Expert: <topic>", "Know Language: <lang>")

---

## P3: Lifepath (Basic, to age 16)

### Roll tables (all stored as string enums for command display)

Chart A (Social Status + Family):
- A1: 1D10 → social status tier + starting cash (¥200–¥1000)
- A2: 1D10 → parent fate (A3, B, or A4)
- A3: 1D10 → what happened to parent(s)
- A4: 1D10 → parental mystery
- B:  1D10 → family standing (good/bad)
- C:  1D10 → family crisis (if bad)
- D:  1D10 → familial goal (if crisis)
- E:  1D10 → siblings (number, gender, age, feelings)
- F:  1D6  → friends (number, type)
- G:  1D10 → enemy (on 10, roll details)
- H:  1D10 → romantic life (H1/H2/H3)
- I:  appearance traits (hair color, style, eye color, personality, value, possession, person)

### Commands (P3 scope)
| Command | Description |
|---------|-------------|
| `+chargen/lifepath` | Display current lifepath state |
| `+chargen/roll-lifepath` | Auto-roll and record all basic lifepath charts |
| `+chargen/lifepath/set <field>=<value>` | Manually set a lifepath field (no rolling) |

### Invariants
- Lifepath must be completed before submitting
- Appearance fields are optional (flavor only)
- Starting cash from lifepath stacks with career equipment bonuses

---

## P4: Rookie Templates

### Templates and their skill bonuses (applied as flat +N)

| Template | Skill Bonuses | Equipment | Cash |
|----------|--------------|-----------|------|
| Anime Hero | Mecha Pilot +1, any 2 Mecha Weapon skills +1, Wardrobe & Style +1, Blade +1, Motorcycle +1, Stealth +1 | clothing, motorcycle, sword/handgun, pilot suit | +300¥ |
| Girlfriend/Boyfriend | Seduction +2, Interrogation +1, Human Perception +2, Driving +1, Shadowing +1 | prized possession, racy clothes | +400¥ |
| Anime Babe | Wardrobe & Style +2, Personal Grooming +2, Social +1, Seduction +1, Handgun +1 | dress, small gun, makeup kit | +150¥ |
| Anime Stud | Ride/Drive +1, Intimidate +1, Blade +1, Handgun +1, Interrogation +1, Streetwise +1, Dodge & Escape +1 | sword, handgun, motorcycle, sunglasses | +100¥ |
| The Big Lug | Intimidate +2, Interrogation +1, Hand to Hand +2, Mecha Tech +1, Dodge & Escape +1 | heavy vehicle, music player, toolkit | +200¥ |
| The Kid | Dodge & Escape +3, any weapon skill +1, Streetwise +1, Athletics +1, Stealth +1 | photo of hero, memento, pet | +100¥ |
| Celebrity | Leadership (EMP) +2, Personal Grooming +1, Wardrobe & Style +1, any performance skill +3 | holo-cam, recordings, minidisk, flashy clothing | +400¥ |

### Commands (P4 scope)
| Command | Description |
|---------|-------------|
| `+chargen/type rookie` | Set character type to Rookie |
| `+chargen/template <name>` | Choose and apply a rookie template |
| `+chargen/template/list` | List available templates |

### Invariants
- Rookie age: 16–20
- Template bonuses stack with starting skill points (they are bonuses, not replacements)
- Rookie templates apply ALL 7 bonus points (no partial selection)
- Once a template is applied, it can be re-applied to swap (recalculating)

---

## P5: Professions (Professional Characters)

### Profession list (D = dangerous)

Actor/Actress, Artist, Athlete, Computer Geek, Cop(D), Criminal(D),
Entertainer, ERT Member(D), Explorer(D), Fleet Officer(D), Game Designer(D),
Gang Member(D), Housewife, Mecha Designer, Mechajock/Combat(D), Medic,
Military Officer(D), Nobleman, Pilot/Non-Combat, Politician, Racer(D),
Reporter, Scientist, Soldier/Mercenary(D), Spy(D), Techie, Thief(D)

Each profession lists 7 skills; player chooses 5 → each gets +1.

### Career mechanics
- Professional age range: 18–30 (must be 18+ for first term, max age 30)
- Each term = 2 years; max 7 terms (age 16→30)
- Dangerous professions trigger Lifepath Appendix roll (K chart)
- Non-dangerous trigger L chart
- Each term: +2D10¥ equipment bonus, 5 skill bonuses (+1 each)
- Career bonuses may raise [H] skills above the +5 starting cap

### Lifepath Appendix events
**K/L charts (roll 1D10):**
- Short affair (M chart)
- Lasting affair → picks up a lover (H1 from basic lifepath)
- New friend (N chart)
- New enemy (O chart)
- Windfall (P chart): favor from powerful person / extra ¥100 / contact / black market access / vital clue
- Accident (Q chart): lose job / blacklisted / financial ruin / lose loved one / implicated / blamed / disfiguring (−1D6 ATT) / bad (−1 REF) / horrible (−2 REF + artificial limb)

### Commands (P5 scope)
| Command | Description |
|---------|-------------|
| `+chargen/type professional` | Set character type to Professional |
| `+chargen/career <profession>` | Add a career term (auto-rolls professional lifepath event) |
| `+chargen/career/skills <term>=<skill1>,<skill2>,...` | Choose 5 skills for a career term |
| `+chargen/career/list` | List available professions and their skill sets |
| `+chargen/career/remove` | Remove last career term |

### Invariants
- Age must be 16 + (terms × 2); cannot exceed 30
- Cannot hold more than 7 terms
- Must choose exactly 5 skills from the profession's 7 before term is finalized
- Accident results that modify stats are applied immediately and are permanent

---

## P6: Submit / Approve / Reject

### Commands
| Command | Lock | Description |
|---------|------|-------------|
| `+chargen/submit` | connected | Submit character for staff review |
| `+chargen/approve <player>` | admin+ | Approve and lock character; set player flags |
| `+chargen/reject <player>=<note>` | admin+ | Return for revision with note |
| `+chargen/pending` | admin+ | List all submitted characters |
| `+chargen/view <player>` | admin+ | View another player's sheet |

### Approval effects
- `chargenStatus` → `"approved"`
- Player IDBObj flag: `"approved"` added
- All stat/skill/career commands blocked post-approval

### Rejection effects
- `chargenStatus` → `"revision"`
- `reviewNote` saved
- Player notified of note via `u.send()`
- Player can re-edit and re-submit

### DB collections
- `mekton.chars` — character records
- `mekton.reviews` — audit log of approvals/rejections

---

## P7: Gear Catalog + Encumbrance

### Gear schema additions

```typescript
// Already in IMektonChar:
// equipment: IEquipmentItem[];
// cash: number;

interface IEquipmentItem {
  name: string;
  category: "melee" | "archery" | "handgun" | "smg" | "rifle" | "shotgun" |
            "heavy" | "armor" | "clothing" | "tool" | "other";
  weight: number;      // kg
  cost: number;        // ¥
  sp?: number;         // armor Stopping Power
  location?: string;   // armor: Head / Torso / R.Arm / L.Arm / R.Leg / L.Leg / All
  wa?: number;         // Weapon Accuracy modifier
  damage?: string;     // e.g. "2D6+" or "5D6"
  range?: string;      // e.g. "15-100" (meters)
  shots?: number;
  bv?: number;         // Burst Value
  conceal?: "P" | "J" | "L" | "N";  // Pocket/Jacket/Long coat/Not concealable
  tl?: number;         // Tech Level
  notes?: string;
}
```

### Static gear catalog (baked into `catalog.ts`)

**Melee weapons (excerpt — full table in catalog.ts)**
| Name | WA | Damage | Weight | Cost¥ | TL |
|------|----|--------|--------|-------|----|
| Battleaxe | -1 | 2D10+ [AP] | 3.5kg | 70 | 2 |
| Broadsword | 0 | 3D6+ [AP] | 3.0kg | 84 | 2 |
| Combat Knife | 0 | 1D6+ [AP] | 0.5kg | 50 | 3 |
| Dagger | 0 | 1D6/2+ [AP] | 0.3kg | 18 | 2 |
| Energy Sword | +1 | 5D6 | 0.25kg | 470 | 7 |
| Monoknife | 0 | 2D6+ [AP] | 0.5kg | 240 | 6 |
| Monosword | +1 | 4D6+ [AP] | 1.0kg | 600 | 6 |
| Rapier | +1 | 1D10+ [AP] | 0.75kg | 75 | 3 |
| Sword | +1 | 2D6+ [AP] | 1.0kg | 100 | 2 |

**Handguns (excerpt)**
| Name | WA | Damage | Shots | BV | Weight | Cost¥ | TL |
|------|----|--------|-------|----|--------|-------|----|
| AutoMag | +1 | 3D6 | 8 | 1 | 1.5kg | 437 | 5 |
| Combat Pistol | +1 | 2D6 | 15 | 1 | 1.0kg | 310 | 5 |
| Energy Pistol | +2 | 1-4D6 | 40D6 | 1 | 1.0kg | 1256 | 7 |
| Hideout Pistol | 0 | 1D10 | 7 | 1 | 0.75kg | 96 | 5 |
| Magnum Revolver | +2 | 4D6 | 6 | 1 | 2.0kg | 1000 | 5 |

**Rifles (excerpt)**
| Name | WA | Damage | Shots | BV | Weight | Cost¥ | TL |
|------|----|--------|-------|----|--------|-------|----|
| Assault Rifle | 0 | 4D6 | 50 | 5 | 4.0kg | 1155 | 5 |
| Energy Rifle | +2 | 1-6D6 | 60D6 | 1 | 3.0kg | 756 | 7 |
| Sniper Rifle | +2 | 5D6 | 10 | 1 | 5.0kg | 775 | 5 |
| SMG | +1 | 2D6 | 50 | 5 | 2.0kg | 945 | 5 |

**Personal armor**
| Name | SP | Location | Weight | Cost¥ | TL |
|------|----|----------|--------|-------|----|
| Light Ballistic Mesh | 10 | Single | 0.2kg | 38 | 5 |
| Medium Ballistic Mesh | 12 | Single | 0.3kg | 47 | 5 |
| Heavy Ballistic Mesh | 15 | Single | 0.4kg | 56 | 5 |
| Flak Mesh | 18 | Single | 0.5kg | 65 | 5 |
| Light Helmet | 20 | Head | 1.6kg | 106 | 5 |
| Medium Helmet | 23 | Head | 1.8kg | 117 | 5 |
| Heavy Helmet | 25 | Head | 2.0kg | 128 | 5 |
| Light Plate | 20 | Single | 0.5kg | 98 | 5 |
| Medium Plate | 23 | Single | 0.6kg | 108 | 5 |
| Heavy Plate | 25 | Single | 1.0kg | 119 | 5 |
| Space Suit (Standard) | 5 | All | 1.6kg | 260 | 5 |
| Space Suit (Military) | 25 | All | 7.0kg | 785 | 5 |
| Powered Armor | 28 | All | 43.0kg | 1056 | 7 |
| Personal Force Screen | 3D6 | All | 5.0kg | 1800 | 8 |
| Advanced Force Screen | 18 | All | 0.5kg | 2500 | 9 |
| Flight Jacket | 12 | Torso+Arms | 1.2kg | 300 | 4 |

**Weapon options**: Lasersight (+1 WA combat, 0.1kg, ¥100, TL5), Optical Scope (-2/+1 range, 0.2kg, ¥100, TL4), Silencer (0.5kg, ¥100, TL5), Smartgun (+2 WA, 0.3kg, ¥500, TL6)

### Encumbrance rules
- Total item weight (kg) ÷ EV = encumbrance load
- Subtract load (rounded down) from MA
- Powered Armor adds +4 to BOD-derived EV and ignores its own weight

### Commands (P7 scope)
| Command | Description |
|---------|-------------|
| `+gear` | List your current equipment and total weight |
| `+gear/buy <name>` | Purchase item from catalog; deducts ¥ cost |
| `+gear/add <name>=<weight>,<cost>` | Add a custom (non-catalog) item |
| `+gear/remove <name>` | Remove an item from inventory |
| `+gear/catalog [<category>]` | Browse gear catalog (melee/handgun/rifle/armor/etc.) |
| `+encumbrance` | Show current load vs. EV and effective MA |

### Invariants
- Cannot buy if cash < item cost
- Cannot buy items above campaign Tech Level (Referee sets campaign TL on the game object)
- Armor stops damage per location (SP value); multiple pieces on same location use highest SP only
- Encumbrance modifier applies to `char.ma` for all movement calculations (computed, not stored)

---

## P8: Interlock Dice Roller (`+roll`)

### Mechanics
- Formula: STAT + SKILL + 1D10
- Critical success: roll 10 → roll again, add (chain on consecutive 10s)
- Critical failure: roll 1 → roll again, subtract (once only)
- Difficulty thresholds: Easy 10 / Average 15 / Difficult 20 / Very Difficult 25 / Nearly Impossible 30

### Commands
| Command | Description |
|---------|-------------|
| `+roll <stat>+<skill>[/<difficulty>]` | Roll Interlock check; show result vs. difficulty |
| `+roll <pool>` | Raw numeric pool (for quick rolls without a character) |

### emits `mekton:roll` gameHooks event
```typescript
interface IMektonRollEvent {
  playerId: string;
  playerName: string;
  roomId: string;
  statName: string;
  skillName: string;
  statValue: number;
  skillValue: number;
  roll: number;        // raw d10 result
  total: number;       // stat + skill + roll
  difficulty?: number;
  success?: boolean;
  critical: "success" | "failure" | null;
  summary: string;     // plain text for GM context
}
```

---

## P9: Sheet Display (`+sheet`)

### Layout (MUSH formatted)
```
%ch%cy══════════════════════ MEKTON ZETA CHARACTER SHEET ══════════════════════%cn
 Name: Alice Yamamoto              Age: 22    Type: Professional (2 terms)
 Status: APPROVED

%ch%cwSTATS%cn
 ATT: 7   BOD: 6   CL:  7   EMP: 5   INT: 8
 LUCK: 5  MA:  6   REF: 7   TECH: 4  EDU: 4

%ch%cwDERIVED%cn
 Head: 6H  Torso: 12H  Limbs: 9H  Stun: 6  Lift: 60kg
 Throw: 20m  DmgBonus: 0  EV: 4  Stability: 17
 Skill Points: 22 (spent: 20)

%ch%cwSKILLS%cn
 [ATT] Personal Grooming +2   Wardrobe & Style +3
 [CL]  Streetwise +2
 [EMP] Human Perception +4   Leadership +3
 [INT] Awareness/Notice +4   Expert: Tactics +2
 [REF] Mecha Piloting +5    Mecha Gunnery +3   Handgun +2
 [TECH] Mecha Tech +3

%ch%cwCAREER HISTORY%cn
 Term 1 (age 16-18): Pilot/Non-Combat — Mecha Pilot +1, Awareness +1...
 Term 2 (age 18-20): Mechajock/Combat — Mecha Gunnery +1, Handgun +1...

%ch%cwLIFEPATH%cn
 Social Status: 7 (Executive/Middle Class)  Starting Cash: ¥700
 Family: Both parents alive. 2 siblings (older brother dislikes, younger sister hero-worships)
 Friends: 3  Enemies: 1  Romance: Currently involved

%ch%cwEQUIPMENT  (¥2400 remaining)%cn
 Pilot's Suit (2kg, ¥300)   Handgun (1kg, ¥200)
%ch%cy══════════════════════════════════════════════════════════════════════════%cn
```

---

## P10: Personal Combat (`+attack`, `+damage`, `+heal`, `+stun`)

### Mechanics (Mekton Zeta core rules)

**Attack roll:** REF + Combat Skill + WA + 1D10 vs. target's Defence (REF + Dodge & Escape + 1D10)
- Net hits on attacker side → hit; defender wins ties
- Hit location: 1D10 → 1=Head, 2-4=Torso, 5-6=R.Arm, 7=L.Arm, 8-9=R.Leg, 10=L.Leg
- Damage: weapon dice (+ BOD damage modifier if melee)
- Armor: subtract location SP from damage; remainder applied to location HP
- Stun/Shock: if damage hits, target rolls Stun number (from BOD) or less on 1D10 or is stunned 1 turn

**Damage tracking (per-location HP):**
- Head / Torso / Limbs (R.Arm, L.Arm, R.Leg, L.Leg) each track independently
- Limb at 0 HP = disabled (cannot use; -2 to all actions involving that limb)
- Torso at 0 HP = incapacitated (unconscious, dying)
- Head at 0 HP = dead

**Luck usage:** player may spend Luck points to add to any roll (1 Luck = +1); refreshes each session

**Healing:**
- First Aid (TECH + First Aid skill): recovers 1D6 hits per location treated (once per wound)
- Medical (TECH + Medical skill): more extensive, can treat complex wounds
- Natural healing: BOD-based rate (1 hit per day minimum; more with rest)

### DB schema additions

```typescript
// Add to IMektonChar:
wounds: {
  head: number;      // current HP remaining (starts at derived value)
  torso: number;
  rArm: number;
  lArm: number;
  rLeg: number;
  lLeg: number;
};
stunned: boolean;           // currently stunned (clears next turn)
luckRemaining: number;      // per-session; refreshes on login each session
firstAidApplied: Record<string, boolean>;  // location → whether first aid used this wound
```

### Combat resolution steps (command flow)

```
+attack <target>=<weapon>
  1. Attacker rolls: REF + skill + weapon WA + 1D10 (critical chain)
  2. Defender rolls: REF + Dodge & Escape + 1D10 (critical chain)
  3. If attacker ≥ defender → hit
  4. Roll 1D10 for hit location
  5. Apply weapon damage dice (+ BOD mod if melee)
  6. Subtract location SP from damage
  7. Apply remaining hits to location HP
  8. Target rolls Stun if damage > 0
  9. Broadcast result to room
```

### Commands (P10 scope)

| Command | Lock | Description |
|---------|------|-------------|
| `+attack <target>=<weapon>` | connected | Resolve a ranged or melee attack; auto-rolls both sides |
| `+attack/manual <target>=<hits>/<location>` | connected | Staff-declared hit: apply hits to location directly |
| `+damage <location>=<hits>` | connected | Apply damage to own character (for traps, falls, etc.) |
| `+damage <player>/<location>=<hits>` | admin+ | Staff: apply damage to another player |
| `+heal <location>` | connected | Roll First Aid on own location (once per wound) |
| `+heal <player>=<location>` | connected | Roll First Aid on another player's location |
| `+stun` | connected | Check/clear stun status |
| `+luck/spend <amount>` | connected | Spend Luck points on last roll (must follow immediately) |
| `+luck` | connected | Show remaining Luck points |

### gameHooks event emitted

```typescript
interface IMektonCombatEvent {
  roomId: string;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  weapon: string;
  attackRoll: number;
  defenceRoll: number;
  hit: boolean;
  location?: string;
  rawDamage?: number;
  armorSP?: number;
  appliedDamage?: number;
  stunCheck?: boolean;
  summary: string;    // plain text for GM context
}
```

### Invariants
- Cannot apply more damage than location's remaining HP (clamp at 0)
- Luck points clamp at 0 (cannot go negative); cannot exceed LUCK stat value
- First Aid may only be applied once per wound per location; resets when location heals to max
- Stun auto-clears after 1 turn (player must use `+stun` to mark recovery)
- Dead characters (Torso = 0 and Head = 0) cannot take further actions; staff must intervene

---

## P11: AI GM Bridge

### IGameSystem implementation (`game-system.ts`)

```typescript
export const mektonSystem: IGameSystem = {
  id: "mekton-zeta",
  name: "Mekton Zeta",
  version: "1.0.0",
  source: "ingested",
  ingestedFrom: ["mekton-zeta-core.txt", "mekton-zeta-plus.txt"],

  coreRulesPrompt: `SYSTEM: Mekton Zeta (Interlock System, R. Talsorian Games)

RESOLUTION: STAT + SKILL + 1D10 vs. Difficulty Number.
  10 Easy / 15 Average / 20 Difficult / 25 Very Difficult / 30 Nearly Impossible.
  Roll 10 = Critical Success (roll again, add). Roll 1 = Critical Failure (roll again, subtract).

STATS: att, bod, cl, emp, int, luck, ma, ref, tech, edu. Range 2–10, average 6.
  Stability (resist manipulation) = CL × 2.5 (floor).
  Luck: per-session points added to any roll; replenishes each session.

SKILLS: rated +1 to +10. Linked to stats. Hard [H] skills capped at +5 at chargen.
  Cost: 1pt/level to +5, then 2pt/level above +5.

MECHA: Pilot skill adds to all mecha combat. Mecha combat uses separate skill set
  (Mecha Piloting, Mecha Gunnery, Mecha Melee, Mecha Fighting, Mecha Missiles).`,

  moveThresholds: { fullSuccess: 20, partialSuccess: 15 },

  stats: ["att", "bod", "cl", "emp", "int", "luck", "ma", "ref", "tech", "edu"] as const,

  adjudicationHint: "Interlock is not fiction-first — rolls are called when skill matters. " +
    "Stack stat + skill + 1d10 vs. difficulty. Use Stability for social contests. " +
    "Luck points are the player's trump card; remind them they exist.",

  hardMoves: [
    "Mecha takes critical damage to a servo (limb/head/torso — roll location)",
    "Enemy pilot ejects; becomes a ground combatant with a grudge",
    "Collateral damage — civilian installation, friendly mecha, or terrain feature destroyed",
    "Communications jammed — player loses contact with command until repaired",
    "Power plant damaged — MA halved until Mecha Tech roll repairs it",
  ],

  softMoves: [
    "Enemy targeting lock acquired — next attack roll at +2",
    "Damage warning light on the console",
    "Civilian or ally in the crossfire — player must choose to act or watch",
    "Mecha systems running hot — next hard hit risks shutdown",
    "A familiar voice on the enemy comms",
  ],

  missConsequenceHint: "On a failed roll vs. difficulty: the situation worsens, the enemy " +
    "acts, or the task simply fails. Hard failures (Critical Failure — rolled 1 then high) " +
    "cause immediate negative consequences: equipment malfunction, enemy counterattack, " +
    "or stat damage. In mecha combat, a miss means the enemy goes next and hits back.",
};
```

### Bridge registration in `init()`
```typescript
gameHooks.emit("gm:system:register" as never, {
  system: mektonSystem,
  events: [
    { name: "mekton:roll", cue: "Mekton roll" },
  ],
});
```

---

## File Layout

```
src/plugins/mekton-zeta/
├── index.ts           IPlugin; imports commands.ts; init: registerStatSystem + gm:system:register + login hook
├── commands.ts        All addCmd registrations (chargen, sheet, roll)
├── schema.ts          IMektonChar + sub-interfaces + DBO collection instances
├── validation.ts      validateStat(), validateSkill(), validatePool(), checkApproved(), checkRequired()
├── display.ts         formatSheet() MUSH output; formatCharacterContext() plain text for GM
├── game-system.ts     IGameSystem literal (mektonSystem)
├── lifepath.ts        Roll table definitions + rollLifepath() generator
├── professions.ts     Profession catalog (skills list per profession)
├── templates.ts       Rookie template definitions + applyTemplate()
├── catalog.ts         Static gear catalog (weapons + armor, full tables from core rules)
├── combat.ts          resolveAttack(), applyDamage(), healLocation(), rollInterlock()
├── roll.ts            rollInterlock() — dice logic (Critical Success/Failure chains)
├── help/
│   ├── chargen.md
│   ├── sheet.md
│   ├── gear.md
│   ├── combat.md
│   └── roll.md
├── tests/
│   └── mekton-zeta.test.ts
└── README.md
```

---

## REST Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/mekton/char` | Bearer | Get caller's own character |
| `GET` | `/api/v1/mekton/chars` | Bearer + admin | List all characters (staff) |
| `GET` | `/api/v1/mekton/gear/catalog` | Bearer | Browse full gear catalog |

---

## Schema Evolution (normalizeChar pattern)

```typescript
function normalizeChar(raw: Partial<IMektonChar>): IMektonChar {
  return {
    id: raw.id ?? crypto.randomUUID(),
    playerId: raw.playerId ?? "",
    playerName: raw.playerName ?? "",
    stats: raw.stats ?? { att: 0, bod: 0, cl: 0, emp: 0, int: 0, luck: 0, ma: 0, ref: 0, tech: 0, edu: 0 },
    skills: raw.skills ?? {},
    lifepath: raw.lifepath ?? { /* safe empty */ },
    charType: raw.charType ?? null,
    rookieTemplate: raw.rookieTemplate ?? null,
    careers: raw.careers ?? [],
    age: raw.age ?? 16,
    equipment: raw.equipment ?? [],
    cash: raw.cash ?? 0,
    statMethod: raw.statMethod ?? null,
    statPointPool: raw.statPointPool ?? null,
    chargenStatus: raw.chargenStatus ?? "draft",
  };
}
```

---

## Invariants Summary

| Rule | Enforced in |
|------|-------------|
| All stats 2–10 | `validateStat()` |
| Concept pool: spent ≤ rolled pool | `validatePool()` |
| Skill [H] ≤ +5 at creation | `validateSkill()` |
| Skill points spent ≤ INT+EDU+10 | `validatePool()` |
| Cannot submit without completing all required fields | `checkRequired()` |
| Age = 16 + (terms × 2), ≤ 30 | career command |
| Post-approval: all edit commands blocked | `checkApproved()` |
| Accident stat penalties are permanent | applied immediately |

---

## Deferred: P12 Psionics (Mekton Plus)

From `mekton-zeta-plus.txt`, chapter "Creating a Psionic Character":
- Active or Latent status
- Psi Points: purchased with character points
- Psi skills (21 total): Astral Projection, Aura Viewing, Clairvoyance, Danger Sensing,
  Emotion Scan, Energy Manipulation, Healing, Illusion, Levitation, Mind Lock,
  Possession, Precognition, Psi Blast, Psi Block, Psychometry, Pyrokinesis,
  Regeneration, Retrocognition, Stat Boost, Suggestion, Telekinesis, Telepathy,
  Teleportation
- Schema addition: `psionic?: { active: boolean; psiPoints: number; psiSkills: Record<string, number> }`
- Command: `+chargen/psi <active|latent>`, `+chargen/psi/skill <name>=<level>`

## Deferred: P13 Mecha Construction (MTS)

From `mekton-zeta-plus.txt` — the Mekton Technical System is an entirely separate design
system for building mecha. This warrants its own plugin phase or a separate plugin:
`ursamu-mekton-mts-plugin`. Key schema: servos, weapons, armor, propulsion, special systems,
scaling (human/roadstriker/corvette/starship). Estimated complexity: 2× chargen.
