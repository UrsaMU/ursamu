# Combat extraction status

Last updated: 2026-07-20 (0.8.0 — turn helpers, adapter kit, AI tags)  
Target consumer: **Court of Miracles / @ursamu/cofd-plugin** first release.

See also: [ADAPTER.md](./ADAPTER.md) for the host integration checklist.

## Hybrid architecture (ships today)

```
@ursamu/combat          engine kernel (0.6.x)
  - walker, JSON AI, ports, store, lifecycle, initiative
  - pathfind / zone-loop / zone-query
  - combat:decide hook bus

@ursamu/cofd-plugin     CofD rules host (primary release)
@ursamu/dnd-plugin      +enc/* engine surface + legacy +combat
@ursamu/mekton-zeta     mekton.encounters ports adapter
@ursamu/ai-gm           combat:decide + brain id "ai-gm" for llm keys
```

**Collections stay per-system** via `EncounterStore`  
(`cofd.encounters`, `dnd.encounters`, `mekton.encounters`).

---

## Backlog status

### P0–P2 — ✅ done
See git history. Store routing, lifecycle, zone helpers,  
rules math stays CofD, multi-collection permanent.

### P3 — ✅ done

13. ~~**ai-gm `combat:decide` for `aiKey: "llm"`**~~ ✅  
    - `packages/ai-gm/combat/decide.ts` — parse + fallback  
    - `packages/ai-gm/combat/wire.ts` — hook + brain `ai-gm`  
    - Wired from `hooks.ts` registerHooks (soft if combat missing)  
    - LLM invoker uses Gemini when `GOOGLE_API_KEY` set;  
      else weakest-enemy attack fallback  

14. ~~**D&D command surface**~~ ✅  
    - `+enc/*` — start/join/status/next/attack/end on  
      `dnd.encounters` + lifecycle + walker  
    - Legacy `+combat/*` room `data.combat` kept for showcase  
    - Ports use `endEncounter` / store save  

15. ~~**Mekton / third system adapter**~~ ✅  
    - `mekton/combat-ports.ts` — `mekton.encounters` store +  
      `makeMektonPorts` (resolveAttack for executeAction)  
    - Plugin init registers store + JSON brain  
    - Personal `+attack` UX remains Mekton-native  

---

## Explicit non-goals

- CofD pools/tilts/grapple inside `@ursamu/combat`
- One shared encounter collection without a migrator
- Replacing every legacy D&D `+combat` path in one PR

---

## File map

| Piece | Package |
|-------|---------|
| Engine | `packages/combat` |
| CofD host | `packages/cofd/src/combat/*` |
| D&D engine cmds | `packages/dnd/src/commands/enc.ts` |
| Mekton ports | `packages/mekton/combat-ports.ts` |
| LLM decide | `packages/ai-gm/combat/*` |

---

## Operator notes

**LLM NPC (any system using combat walker):**

1. Load `@ursamu/combat` then game system then `@ursamu/ai-gm`.  
2. Set NPC `aiKey` to `llm` (or `ai-gm`).  
3. Optional config: `"plugins": { "combat": { "brains": ["ai-gm", "json"] } }`  
4. Need `GOOGLE_API_KEY` for real LLM; without it, fallback attacks  
   weakest living foe.

**D&D engine path:** `+enc/start` → `+enc/attack` / `+enc/next`.
