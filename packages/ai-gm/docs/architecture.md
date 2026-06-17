# ai-gm — Architecture

## File Layout

```
books/               ← Drop game PDFs/TXT/MD here (watched by watcher.ts)

ingestion/
  watcher.ts         Deno.watchFs + debounce — triggers pipeline on file change
  extractor.ts       PDF/TXT/MD → ITextChunk[]
  analyzer.ts        LangGraph agent: extract rules from each chunk
  synthesizer.ts     Vote/merge extractions → IGameSystemDraft
  reviewer.ts        In-game admin review flow (conflict resolution)
  pipeline.ts        Orchestrates all phases with DB checkpoints

systems/
  interface.ts       IGameSystem extends IStatSystem
  store.ts           DB-backed registry — Zod-validated on load
  urban-shadows.ts   Bundled default system

graphs/
  base.ts            Shared GMStateAnnotation + graph builder helpers
  index.ts           Graph registry — buildAllGraphs(model)
  pose.ts            Round adjudication (all players posed → narrate)
  oracle.ts          Yes/No oracle with probability shading
  move.ts            PbtA / dice-pool move adjudication
  scene-page.ts      Scene orientation page on room entry
  scene-set.ts       Vivid narration from player scene-set descriptions
  job-review.ts      Pending staff job review
  session.ts         End-of-session summaries
  world-event.ts     Off-screen world event proposals

context/
  loader.ts          Assembles room context (chars, NPCs, fronts, scenes)
  compressor.ts      Token-aware context compression
  cache.ts           Session snapshot cache (invalidated by hooks)
  injector.ts        Injects context into LangGraph state

monetization/
  interface.ts       IPaymentAdapter, IPlayerWallet, IFeatureCosts
  db.ts              DBO collections for wallets and ledger
  credits.ts         Immutable ledger + TOCTOU-safe mutations
  gates.ts           Feature cost checks (checkGate / chargeGate)
  plans.ts           Default subscription plan catalogue
  null-adapter.ts    No-op adapter (default when Stripe unconfigured)
  stripe/adapter.ts  Stripe Checkout + webhook handler
  webhook.ts         Maps Stripe events → credit/subscription mutations

social/
  discord.ts         Discord webhook bridge
  journal.ts         AI session recaps
  spotlight.ts       Player moment tracker
  persona.ts         Multi-persona support

api/
  routes.ts          REST JSON API dispatcher

hooks.ts             All gameHooks listeners (rounds, scenes, jobs, bridge events)
round-manager.ts     Round lifecycle (open → contributions → adjudicate → close)
schema.ts            Zod schemas for all DB-stored records
db.ts                DBO collection instances
```

## LangGraph Flow

Each GM action runs a typed LangGraph state machine:

```
Player poses → round accumulates contributions
               → all ready (or timeout) → pose graph
                  ├─ tool: oracle_roll
                  ├─ tool: move_adjudicate
                  ├─ tool: scene_describe
                  └─ output: narration broadcast to room
```

The `IGameSystem` loaded at runtime shapes every graph:

- `coreRulesPrompt` is injected into the system prompt
- `moveThresholds` defines success/partial/miss bands
- `hardMoves` / `softMoves` are seeded into every move adjudication
- `formatMoveResult` / `formatCharacterContext` format context blocks

## Plugin Bridge

Peer plugins can register game systems and inject mechanical context at runtime.
See [bridge.md](bridge.md).
