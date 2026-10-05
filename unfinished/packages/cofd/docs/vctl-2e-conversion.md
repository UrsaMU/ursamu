# Victorian Lost → CtL 2e conversion

**Source extract:** `books/vctl.txt`  
(*Victorian Lost: A Maze of Smoke and Hedge*, WW70006 — CtL 1e)  
**Target:** Chronicles of Darkness / Changeling: The Lost **2e** data in
`resources/changeling.json` and `resources/changeling-contracts.json`.

Books stay gitignored / unpublished; this doc records what was converted
and how 1e terms map into the 2e engine.

---

## Scope

Victorian Lost is a **historical setting** book (late Victorian London),
not a full core rewrite. Mechanical payload:

| 1e content | 2e destination |
|------------|----------------|
| Kith **Inventor** (Wizened) | `changeling.json` kith (blessing upgraded) |
| Kith **Lurker** (Darkling) | `changeling.json` kith (blessing upgraded) |
| Contracts of Artifice · Tatterdemalion’s Workshop (•••••) | Existing Jewels royal + Victorian note |
| Contracts of Vainglory · Splendor of the Envoy’s Protection (•••) | New Crown common **Envoy's Splendor** |
| Contracts of Smoke · Smoke-Stepping (••••) | New Mirror royal **Smoke-Stepping** |
| Goblin · Riot (••••) | New goblin **Riot** |
| Goblin · Sabotage (•••••) | New goblin **Sabotage** |

Setting fiction, serial, Back Stairs Mob NPCs, and entitlements are
**not** auto-imported (use as ST material from the extract).

---

## System mapping (1e → 2e)

| 1e | 2e |
|----|-----|
| Contracts of Artifice | Regalia **Jewels** |
| Contracts of Vainglory | Regalia **Crown** |
| Contracts of Smoke | Regalia **Mirror** |
| Clause dots (•–•••••) | **common** (≈1–3) / **royal** (≈4–5); goblin stay goblin |
| Catch | **Loophole** (waives Glamour on invoke) |
| Attribute + Wyrd alone | Prefer Attribute + Skill + Wyrd when a skill fits |
| Merit: Striking Looks / Status | Named in effect text (Merits still catalogued separately) |
| Clarity / Glamour / Wyrd | Unchanged (already 2e sheet) |

---

## Kiths (blessings)

### Inventor (Wizened) — *Inventive Genius*

**1e:** 8-again Crafts/Science (design, build, modify, repair devices);
spend 1 Glamour to add Wyrd dice.

**2e (shipped):** Same numbers; wording fits chargen/`+info` summaries.
`source: victorian-lost`.

### Lurker (Darkling) — *Larcenous Fingers*

**1e:** 9-again Larceny; no tool penalties; 1 Glamour → +2 Larceny;
8-again Stealth (instead of Darkling’s usual 9-again Stealth in 1e).

**2e (shipped):** Same; Darkling seeming curse/blessing elsewhere
unchanged. Replaces the prior abbreviated “+2 Stealth” stub.

---

## Contracts (summaries)

Full text lives in JSON. Design notes:

- **Envoy's Splendor** — Victorian social station mattered more than
  looks; Status (Society) + reduced Striking Looks vs pure beauty.
- **Smoke-Stepping** — pea-soup fog teleport; outdoor fog/smog gate;
  Mirror royal (stealth/transition), not Steed (travel without fog).
- **Riot / Sabotage** — Goblin Contracts keep the rebellion price
  (WP + memory / self-harm on the machine).

---

## Not converted (yet)

- Anti-Gentrification League entitlement
- Back Stairs Mob pregens (use as ST NPCs)
- Period fashion / LARP advice
- Full prose of Chapters 1–6

To extend: extract with `books/vctl.txt`, keep 78-col help summaries,
add `source: victorian-lost` on new rows.

---

## Verify

```bash
cd packages/cofd
deno test tests/vctl_2e.test.ts -A --unstable-kv --no-check
```
