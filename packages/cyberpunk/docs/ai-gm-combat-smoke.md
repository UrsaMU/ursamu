# AI-GM + CPR combat smoke

What you need for **real** AI-GM coverage of FNFF combat (not
just JSON `aggressive` brains).

## Layers

| Layer | Role | CPR |
|------|------|-----|
| combat walker | NPC turns | wired (+pass/attack) |
| JSON brains | aggressive, etc. | default aiKey |
| combat:decide | plugin claim turn | combat plugin init |
| @ursamu/ai-gm | LLM decide | **not in game plugins** |
| CPR gm-bridge | system prompt | CPR init |

JSON AI works today without ai-gm:

```
+npc/build Razor=boosterganger
+init
+pass          # Razor attacks via aggressive brain
```

LLM AI needs ai-gm installed and an API key.

## Install checklist (games)

1. **Plugin** — add after combat, before or after cyberpunk:

```json
"server": {
  "plugins": [
    "@ursamu/combat",
    "@ursamu/ai-gm",
    "@ursamu/cyberpunk-plugin"
  ]
}
```

Import map (workspace):

```json
"@ursamu/ai-gm": "../../packages/ai-gm/mod.ts"
```

2. **Config**

```json
"plugins": {
  "combat": {
    "brains": ["json"],
    "defaultAiKey": "aggressive",
    "enableDecideHook": true
  }
}
```

Prefer LLM when present (if your ai-gm version registers brain
`ai-gm`):

```json
"brains": ["ai-gm", "json"]
```

3. **Env**

```bash
GOOGLE_API_KEY=...          # required for Gemini
# optional:
# AI_GM_* per packages/ai-gm/docs/configuration.md
```

4. **In-game GM**

```
+gm/watch                 # watch the fight room
+gm/session/open fnff     # open a session (if required)
+npc/build Razor=boosterganger
+npc/ai Razor=llm         # or ai-gm — JSON skips, hook may claim
+init
+attack Razor
+pass
```

5. **Version note**

Combat README targets `@ursamu/ai-gm` ≥ **0.2.4** for combat
decide wiring. Workspace package may be **0.2.3** — confirm
`combat:decide` listener exists after install. If missing,
upgrade ai-gm or use JSON brains only.

## Smoke matrix

### A. JSON AI (no API key) — always available

```bash
# server running
deno run -A --unstable-kv packages/cyberpunk/tools/smoke-combat.ts
# plus manual:
#   +npc/build X=boosterganger
#   +init / +pass / +attack / rounds advance past 2
```

### B. Unit walker

```bash
cd packages/cyberpunk
deno test -A --unstable-kv --no-check tests/npc_walker.test.ts
```

### C. AI-GM combat (live)

Prereqs: A green, ai-gm loaded, `GOOGLE_API_KEY` set, room watched.

```
# staff
+gm/watch
+npc/build ChromeDog=boosterganger
+npc/ai ChromeDog=llm
+init
# player
+attack ChromeDog with heavy_pistol
+pass
# Expect: walker invokes decide; LLM or fallback attack;
# narration from GM if session open
+combat
# round should climb 1 → 2 → 3 …
+combat/end
```

Pass criteria:

- [ ] NPC turn banner appears without hanging
- [ ] Attack resolves (hit or miss) against PC
- [ ] Round number increases across full queue wraps
- [ ] With key: GM text or decide log
- [ ] Without key: JSON/fallback still ends turn

## CPR bridge already emits

`registerWithGM()` in `engine/gm-bridge.ts` feeds system context
(wound vocabulary, FNFF summary). Combat still needs walker +
`aiKey=llm` + ai-gm listening on `combat:decide` for LLM turns.

## Gaps to watch

1. **ai-gm not in game plugins** — install first.
2. **aiKey** — spawn defaults `aggressive`; set `llm` for GM.
3. **Round desync** — fixed by write-back after walker (legacy
   `cpr.combat` ← encounter turnIdx/round).
4. **Dual trackers** — keep using `+init`/`+pass`/`+attack` so
   both stay synced; don’t only poke the encounter store.
