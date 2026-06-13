# ai-gm — Design Specification

**Status:** Implementation Complete (v0.1.0) | **Design date:** 2026-03-20 |
**Updated:** 2026-03-21 **Authors:** kumakun + Claude Code

> **Note:** This is the original design specification. The implementation
> diverges from it in several places — see §12 (Implementation Notes) for a full
> list of what changed and why.

---

## 1. Understanding Summary

- **What:** A standalone, installable UrsaMU plugin (`ai-gm`) that replaces the
  existing in-tree `gm` plugin in urban-shadows — and works on any UrsaMU game
- **Why:** Any game admin (non-coder) should be able to install it, drop in
  their game books, and have a fully configured AI-GM running — no code changes,
  no developers required
- **Who:** Game admins (non-coders) are the primary operators; players are
  secondary consumers of GM output
- **Key constraints:**
  - Formats: PDF + plain text/Markdown
  - Trigger: auto-detect folder changes (drop files and walk away)
  - Output: structured `IGameSystem` in DB + customized prompts
  - Setup: in-game chat with AI + supporting `+gm/*` commands
  - Apply: auto-apply confident defaults, flag uncertain items for admin review
  - Notification: setup chat thread + auto-created AI-GM BBS board
  - REST API implemented now for future web UI
  - Flexible monetization: payment interface + Stripe adapter
  - Builds against ursamu v1.5.7 (released)
- **Explicit non-goals:**
  - Web UI (REST routes make it ready; UI is a separate project)
  - Requiring code edits to support new game systems

---

## 2. Assumptions

- PDF and text parsing happens server-side (Deno process)
- The AI doing ingestion uses the same Gemini provider already configured
- A "confident default" means the AI found clear, unambiguous text in the books
- `IStatSystem` + `registerStatSystem()` from ursamu v1.5.7 (released) are
  available
- `seedBoards(["AI-GM"])` auto-creates the admin notification board in `init()`
- `registerJobBuckets(["INGESTION", "GM-REVIEW"])` adds custom job queues
- Discord integration reuses the existing Discord config pattern from
  urban-shadows
- Wiki page generation uses the existing HTTP wiki API in the codebase
- Spotlight tracking is passive — GM notices via context, no separate
  player-activity DB
- Payment interface ships with Stripe adapter; other processors are
  community-contributed
- Channel history (#44) not yet in ursamu — ingestion transcript is self-managed
  in `IIngestionExchange[]` on the job record; will migrate when #44 lands
- Plugin discovery (#43) not yet in ursamu — installable via direct GitHub URL
  or `jsr:@ursamu/ai-gm` until registry exists

---

## 3. Repository Structure

```
ai-gm/
├── ursamu.plugin.json          # Manifest: name, version, author, main
├── deno.json                   # Imports: ursamu v1.5.7, LangGraph, Gemini, Stripe, zod
├── mod.ts                      # Public API surface
├── index.ts                    # IPlugin export — init(), remove()
│
├── ingestion/
│   ├── watcher.ts              # Deno.watchFs() on configured books folder
│   ├── extractor.ts            # PDF + text/MD → raw text chunks
│   ├── analyzer.ts             # LangGraph: chunks → IGameSystemDraft
│   ├── synthesizer.ts          # Merge multi-book drafts, flag uncertain items
│   ├── reviewer.ts             # In-game chat conversation agent (guided setup)
│   └── schema.ts               # IIngestionJob, IGameSystemDraft, IUncertainItem
│
├── systems/
│   ├── interface.ts            # IGameSystem extends IStatSystem
│   ├── store.ts                # Load/save IGameSystem to DB; registerStatSystem()
│   └── urban-shadows.ts        # Default bundled system (Urban Shadows 2E)
│
├── graphs/                     # All LangGraph graphs
│   ├── base.ts                 # Shared GMStateAnnotation, ToolNode, graph builder
│   ├── index.ts                # Graph registry
│   ├── pose.ts                 # Adjudicates completed rounds
│   ├── oracle.ts               # Yes/no questions with probability shading
│   ├── move.ts                 # PbtA move roll adjudication
│   ├── job-review.ts           # Reviews pending staff jobs
│   ├── downtime.ts             # Resolves downtime actions
│   ├── session.ts              # End-of-session summaries
│   ├── world-event.ts          # Off-screen world event proposals
│   ├── scene-page.ts           # Scene orientation on room entry
│   └── scene-set.ts            # Vivid narration from player scene-set descriptions
│
├── prompts/
│   ├── base.ts                 # buildBasePrompt() — persona, rules, moves, scene, chars
│   ├── templates.ts            # Per-graph system prompt suffixes
│   └── solo_gm_text.ts         # Solo RPG Revolution principles
│
├── context/
│   ├── cache.ts                # SessionContextCache — lazy load, per-section invalidation
│   ├── loader.ts               # ISessionSnapshot, IRoomContext, lore fetch
│   ├── compressor.ts           # Format all data types for prompt injection
│   └── injector.ts             # buildInjectedPrompt(), IInjectOptions
│
├── tools.ts                    # GM LangGraph tools (get_character, tick_clock, etc.)
├── hooks.ts                    # gameHooks registrations
├── commands.ts                 # All +gm/* in-game commands
├── round-manager.ts            # Round lifecycle (open, add pose, close, timeout)
│
├── monetization/
│   ├── interface.ts            # IPaymentAdapter
│   ├── stripe/
│   │   └── adapter.ts          # Stripe implementation of IPaymentAdapter
│   ├── credits.ts              # Credit ledger, deduction, balance checks
│   └── gates.ts                # Scene gates, subscription checks
│
├── social/
│   ├── discord.ts              # Discord bridge (recaps, summaries, reveals)
│   ├── journal.ts              # Campaign journal → wiki pages
│   ├── spotlight.ts            # Character spotlight tracker
│   └── persona.ts              # Per-room/faction AI persona registry
│
└── api/
    └── routes.ts               # REST endpoints via registerPluginRoute()
```

---

## 4. Ingestion Pipeline

The ingestion pipeline is a **multi-node LangGraph graph** with checkpointed
state saved to DB at each phase — survives crashes and restarts.

### Flow

```
Deno.watchFs() on books folder
    │  (new or changed file detected)
    ▼
[ file_detector ]
  - Detects new/changed PDF or text files
  - Creates IIngestionJob in DB (phase: "queued")
  - Pages all top-level admins (GOD/WIZARD flag) into AI-GM board
  - All admins auto-joined to setup conversation
    │
    ▼
[ extractor ]
  - PDF → text via pdf-parse
  - MD/txt passed through directly
  - Chunks text by chapter/section (overlapping windows)
  - Tags each chunk with source file + section heading
    │
    ▼
[ analyzer ]  ◄── tools (re-read chunks, cross-reference sections, store notes)
  - Iterates chunks across all ingested books
  - Extracts per chunk: stats, thresholds, move lists, core rules, lore, tone
  - Tags each extraction with confidence score (high / uncertain / conflicted)
  - Multiple reasoning passes — not a single prompt
    │
    ▼
[ synthesizer ]  ◄── tools
  - Merges all chunk extractions into one IGameSystemDraft
  - Reconciles conflicts between books (e.g. same stat defined differently)
  - Scores confidence per field: high / uncertain / conflicted
  - Produces final list of IUncertainItem[] for admin review
    │
    ▼
[ reviewer ]
  - Enters in-game chat with admin(s) via pages
  - Every exchange saved to IIngestionExchange[] on the job record
  - Presents confident fields: "I found these stats: Blood, Heart, Mind, Spirit — confirm?"
  - Walks through uncertain items one at a time
  - Admin approves, corrects, or skips each
    │
    ▼
[ committer ]
  - Writes approved IGameSystem to server.gm.custom_systems
  - Calls registerStatSystem() — engine-wide registration
  - Calls registerJobBuckets(["INGESTION", "GM-REVIEW"])
  - Sets IGMConfig.systemId to new system
  - Posts completion report to AI-GM BBS board
  - Pages all admins with summary
```

### Key Schema

```typescript
interface IIngestionJob {
  id: string;
  files: string[];
  phase:
    | "queued"
    | "extracting"
    | "analyzing"
    | "reviewing"
    | "committed"
    | "failed";
  draft?: IGameSystemDraft;
  uncertainItems: IUncertainItem[];
  resolvedItems: IResolvedItem[];
  exchanges: IIngestionExchange[]; // full setup conversation transcript
  adminIds: string[]; // admins paged into this job
  startedAt: Date;
  updatedAt: Date;
  error?: string;
}

interface IIngestionExchange {
  role: "gm" | "admin";
  adminId?: string;
  message: string;
  timestamp: Date;
}

interface IUncertainItem {
  field: string; // e.g. "moveThresholds.partialSuccess"
  foundValues: string[]; // conflicting values across books
  sources: string[]; // which files each came from
  gmSuggestion: string; // AI recommendation with reasoning
}
```

### Transcript Recovery

- `+gm/ingest/transcript <jobId>` — exports full setup conversation
- `GET /api/v1/gm/ingestion/:id/transcript` — REST endpoint for web UI
- Will migrate to ursamu channel history API when issue #44 lands

---

## 5. Dynamic Game System Storage

`IGameSystem` extends `IStatSystem` (ursamu v1.5.7) and adds GM-specific fields:

```typescript
interface IGameSystem extends IStatSystem {
  // Inherited from IStatSystem
  name: string;
  version: string;
  getCategories(): string[];
  getStats(category?: string): string[];
  getStat(actor: Record<string, unknown>, stat: string): unknown;
  setStat(
    actor: Record<string, unknown>,
    stat: string,
    value: unknown,
  ): Promise<void>;
  validate(stat: string, value: unknown): boolean | string;

  // GM-specific
  coreRulesPrompt: string;
  moveThresholds: IMoveThreshold; // 10+, 7-9, 6- definitions
  hardMoves: string[];
  softMoves: string[];
  missConsequenceHint: string;
  formatCharacterContext(char: unknown): string;
  formatMoveResult(move: string, roll: number): string;

  // Source metadata
  source: "bundled" | "ingested";
  ingestedFrom?: string[]; // original filenames
  confidence: Record<string, "high" | "uncertain">;
}
```

### Storage Flow

- **Bundled systems** (Urban Shadows 2E) ship in code, registered via
  `registerStatSystem()` at `init()`
- **Ingested systems** serialized to JSON in `server.gm.custom_systems`
- On startup, `store.ts` loads all DB systems, deserializes, calls
  `registerStatSystem()` for each
- GM picks active system via `IGMConfig.systemId` — falls back to
  `"urban-shadows"` if unset
- Admin switches with `+gm/config/system <name>`

### DB Collections

| Collection                 | Contents                                       |
| -------------------------- | ---------------------------------------------- |
| `server.gm.config`         | Single IGMConfig record                        |
| `server.gm.sessions`       | IGMSession[]                                   |
| `server.gm.exchanges`      | IGMExchange[] (all GM outputs)                 |
| `server.gm.memory`         | IGMMemory[] (plot notes, NPC states)           |
| `server.gm.reveals`        | IGMReveal[] (queued story reveals)             |
| `server.gm.rounds`         | IGMRound[] (per-room round records)            |
| `server.gm.custom_systems` | IGameSystem[] (DB-stored ingested systems)     |
| `server.gm.ingestion_jobs` | IIngestionJob[] (ingestion runs + transcripts) |

---

## 6. Monetization Layer

### Payment Interface

```typescript
interface IPaymentAdapter {
  name: string;
  // Subscriptions
  createSubscription(playerId: string, tierId: string): Promise<ISubscription>;
  cancelSubscription(playerId: string): Promise<void>;
  getSubscription(playerId: string): Promise<ISubscription | null>;
  // Credits
  getBalance(playerId: string): Promise<number>;
  deductCredits(
    playerId: string,
    amount: number,
    reason: string,
  ): Promise<boolean>;
  addCredits(playerId: string, amount: number, reason: string): Promise<void>;
  // Webhooks
  handleWebhook(payload: unknown, signature: string): Promise<void>;
}
```

### Gate Configuration (admin-configurable)

```typescript
interface IGMGates {
  mode: "disabled" | "subscription" | "credits" | "hybrid";
  activateScene: number; // credits to activate GM in a scene (0 = free)
  oracleQuery: number; // credits per +gm/oracle query
  requiredTier?: string; // subscription tier needed for GM access
  staffBypass: boolean; // staff always free (default: true)
}
```

### Stripe Adapter

Ships in the box. Admin provides:

- `STRIPE_SECRET_KEY` env var
- `STRIPE_WEBHOOK_SECRET` env var

Handles: subscription creation, webhook events (payment succeeded, subscription
cancelled, payment failed), credit top-ups via Stripe Checkout.

### Player Commands

- `+gm/credits` — check credit balance
- `+gm/subscribe` — receive Stripe-hosted checkout URL via page
- `+gm/sub/cancel` — cancel subscription

### REST Endpoints (Monetization)

- `POST /api/v1/gm/webhook` — Stripe webhook receiver
- `GET /api/v1/gm/players/:id/balance` — credit balance
- `GET /api/v1/gm/players/:id/subscription` — subscription status
- `POST /api/v1/gm/players/:id/credits` — add credits (admin)

---

## 7. Social Features

### Discord Bridge (`social/discord.ts`)

- After each adjudicated round: posts scene recap to configured Discord channel
- After session close: posts narrative session summary
- On lore reveal: posts to Discord with spoiler tags if configured
- Reuses Discord config pattern from urban-shadows (`config.json` discord
  section)

### Campaign Journal (`social/journal.ts`)

- On session close: GM writes a narrative recap
- Stored as wiki page via existing HTTP wiki API
- Shareable URL: `/wiki/journal/<session-id>`
- `+gm/journal` — list all session journal entries
- `GET /api/v1/gm/journal` — REST endpoint

### Character Spotlight Tracker (`social/spotlight.ts`)

- Passive — GM tracks last-pose timestamp per player per session
- When a player hasn't contributed in N rounds (configurable), GM is nudged via
  context injection
- GM actively weaves them back into narration
- `+gm/spotlight` — staff view of current spotlight status per player
- `GET /api/v1/gm/spotlight` — REST endpoint

### Multi-Persona Support (`social/persona.ts`)

- Admin assigns a persona to a room or faction:
  `+gm/persona/set <room>=<personaId>`
- Each persona has: name, tone, style, oocBrackets (same structure as base
  IGMConfig.persona)
- GM selects persona based on active room when building the base prompt
- `+gm/persona/list` — list all defined personas
- `+gm/persona/new <name>` — create new persona (guided chat with AI)
- `GET /api/v1/gm/personas` — REST endpoint

---

## 8. Planned Future Features (filed as issues)

| Feature                                     | Issue     | Notes                                         |
| ------------------------------------------- | --------- | --------------------------------------------- |
| Plugin marketplace / `ursamu plugin search` | ursamu#43 | Hosted registry.json, search by name/tag      |
| Persistent channel history                  | ursamu#44 | Opt-in per-channel logging; transcript export |

When **ursamu#44** lands: migrate ingestion transcript from self-managed
`IIngestionExchange[]` to native channel history API with minimal changes.

When **ursamu#43** lands: register `ai-gm` in the official plugin registry.

---

## 9. REST API Surface

All routes registered via `registerPluginRoute()` from ursamu v1.5.7.

### Ingestion

| Method | Path                                  | Description                |
| ------ | ------------------------------------- | -------------------------- |
| `GET`  | `/api/v1/gm/ingestion`                | List all ingestion jobs    |
| `GET`  | `/api/v1/gm/ingestion/:id`            | Get job status + draft     |
| `POST` | `/api/v1/gm/ingestion`                | Manually trigger ingestion |
| `GET`  | `/api/v1/gm/ingestion/:id/transcript` | Full setup conversation    |

### Game Systems

| Method   | Path                     | Description                 |
| -------- | ------------------------ | --------------------------- |
| `GET`    | `/api/v1/gm/systems`     | List all registered systems |
| `GET`    | `/api/v1/gm/systems/:id` | Get system detail           |
| `PATCH`  | `/api/v1/gm/systems/:id` | Update system config        |
| `DELETE` | `/api/v1/gm/systems/:id` | Remove ingested system      |

### Config

| Method  | Path                | Description          |
| ------- | ------------------- | -------------------- |
| `GET`   | `/api/v1/gm/config` | Get full IGMConfig   |
| `PATCH` | `/api/v1/gm/config` | Update config fields |

### Sessions & Exchanges

| Method | Path                                | Description              |
| ------ | ----------------------------------- | ------------------------ |
| `GET`  | `/api/v1/gm/sessions`               | List sessions            |
| `GET`  | `/api/v1/gm/sessions/:id/exchanges` | All exchanges in session |
| `GET`  | `/api/v1/gm/journal`                | Campaign journal entries |

### Monetization

| Method | Path                                  | Description              |
| ------ | ------------------------------------- | ------------------------ |
| `POST` | `/api/v1/gm/webhook`                  | Stripe webhook receiver  |
| `GET`  | `/api/v1/gm/players/:id/balance`      | Credit balance           |
| `GET`  | `/api/v1/gm/players/:id/subscription` | Subscription status      |
| `POST` | `/api/v1/gm/players/:id/credits`      | Add credits (staff only) |

### Social

| Method  | Path                      | Description              |
| ------- | ------------------------- | ------------------------ |
| `GET`   | `/api/v1/gm/spotlight`    | Current spotlight status |
| `GET`   | `/api/v1/gm/personas`     | List personas            |
| `POST`  | `/api/v1/gm/personas`     | Create persona           |
| `PATCH` | `/api/v1/gm/personas/:id` | Update persona           |

---

## 10. In-Game Commands

### Configuration

- `+gm/config` — show full config
- `+gm/config/model <model>` — set Gemini model
- `+gm/config/apikey <key>` — set API key
- `+gm/config/mode <auto|hybrid>` — set adjudication mode
- `+gm/config/chaos <1-9>` — set chaos factor
- `+gm/config/system <name>` — switch active game system
- `+gm/config/booksdir <path>` — set books folder path

### Ingestion

- `+gm/ingest` — manually trigger ingestion of books folder
- `+gm/ingest/status` — show current ingestion job status
- `+gm/ingest/transcript <jobId>` — export setup conversation

### Personas

- `+gm/persona/list` — list all personas
- `+gm/persona/new <name>` — create persona (guided AI chat)
- `+gm/persona/set <room>=<personaId>` — assign persona to room

### Social / Staff

- `+gm/spotlight` — view spotlight status per player
- `+gm/journal` — list campaign journal entries

### Player

- `+gm/credits` — check credit balance
- `+gm/subscribe` — get subscription checkout link
- `+gm/sub/cancel` — cancel subscription
- `+gm/mystory` — personal story arc summary from GM memory

---

## 11. Decision Log

| Decision                                      | Alternatives Considered      | Rationale                                                                 |
| --------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Standalone repo, not in-tree                  | Keep in urban-shadows        | Reusable across any UrsaMU game; installable via plugin system            |
| Replace existing gm plugin entirely           | Complement alongside it      | One source of truth; cleaner architecture                                 |
| LangGraph agentic ingestion pipeline          | Simple prompt + parse        | Reasoning across chapters, multi-pass reconciliation, conflict resolution |
| Folder-drop auto-detect (watchFs)             | Manual trigger only          | Zero friction for admins                                                  |
| Merge all books, AI reconciles                | Priority tagging by filename | Simpler for admins; AI handles complexity                                 |
| Hybrid apply (auto + flag uncertain)          | Full auto / full manual      | Best of both — fast for obvious rules, safe for ambiguous ones            |
| IGameSystem extends IStatSystem (v1.5.7)      | Separate parallel interface  | Engine-wide registration; aligns with ursamu's direction                  |
| In-game chat for setup (+ BBS board)          | Web UI wizard                | Works in existing client; web UI deferred                                 |
| Stripe adapter with IPaymentAdapter interface | Stripe only / no payment     | Admin flexibility; community can add other processors                     |
| Self-managed transcript in IIngestionJob      | Rely on channel history      | ursamu#44 not yet landed; will migrate when ready                         |
| Build against ursamu v1.5.7 (released)        | Wait for merge               | Shipped as planned                                                        |

---

## 12. Implementation Notes — Divergences from Spec

This section records where the shipped implementation differs from the design
above.

### IPaymentAdapter interface (§6)

The spec defined a stateful interface (`getBalance`, `addCredits`,
`deductCredits`, `getSubscription`). The actual implementation uses a
**stateless checkout/webhook model** instead — the adapter only creates Checkout
sessions and parses webhooks; all wallet state lives in the plugin's own
`IPlayerWallet` / ledger DBO collections.

```typescript
// Actual interface (monetization/interface.ts)
interface IPaymentAdapter {
  createCreditCheckout(
    playerId,
    credits,
    priceUsd,
    successUrl,
    cancelUrl,
  ): Promise<ICheckoutResult>;
  createSubscriptionCheckout(
    playerId,
    plan,
    successUrl,
    cancelUrl,
  ): Promise<ICheckoutResult>;
  cancelSubscription(subscriptionId): Promise<void>;
  handleWebhook(
    rawBody: Uint8Array,
    signatureHeader: string,
  ): Promise<IWebhookEvent>;
}
```

### Feature gates (§6)

The spec's `IGMGates` (mode, activateScene, requiredTier, staffBypass) was
replaced with `IFeatureCosts` — a simple per-feature credit cost table. Staff
bypass is implicit (staff commands don't go through gates). Gate mode switching
is not implemented; gates are always cost-based.

```typescript
interface IFeatureCosts {
  oracle: number; // default 1
  move: number; // default 1
  roundAdjudication: number; // default 0 (free)
  sceneFrame: number; // default 0 (free)
}
```

### Persona system (§7)

The spec described **room/faction personas**
(`+gm/persona/set <room>=<personaId>`). The implementation ships **player
personas** instead: each player registers named alternates for themselves
(`+gm/persona/new`, `+gm/persona/use`). The GM uses the player's active persona
name in narration. Room-scoped personas are a future enhancement.

### REST API path prefix (§9)

All routes use `/api/gm/...` — the `/v1/` version segment was dropped to keep
paths short. The ingestion, game systems, and config PATCH/DELETE routes listed
in §9 are **not yet implemented** — the REST layer covers sessions, journal,
spotlights, wallets, plans, webhook, and admin credit grant only.

### Commands not implemented from §10

| Spec command                  | Status                                            |
| ----------------------------- | ------------------------------------------------- |
| `+gm/config/apikey <key>`     | Removed — API key is `.env` only (security)       |
| `+gm/subscribe`               | Renamed to `+gm/sub/start <planId>`               |
| `+gm/mystory`                 | Deferred                                          |
| `+gm/persona/set <room>=<id>` | Not implemented (player personas shipped instead) |
| `+gm/persona/list`            | Renamed to `+gm/persona`                          |

### Commands added beyond spec

| Command                                                       | Purpose                                               |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `+gm/watch` / `+gm/unwatch`                                   | Add/remove current room from GM watch list            |
| `+gm/ignore` / `+gm/unignore`                                 | Suppress GM responses for a specific player           |
| `+gm/config/booksdir <path>`                                  | Set book folder path in-game (path-traversal guarded) |
| `+gm/ingest/review <jobId>/<itemId>=<value>`                  | Resolve uncertain ingestion item                      |
| `+gm/ingest/approve` / `reject`                               | Approve or cancel an ingestion job                    |
| `+gm/credits/buy` / `grant`                                   | Credit purchase and admin grant                       |
| `+gm/sub`, `+gm/sub/plans`, `+gm/sub/start`, `+gm/sub/cancel` | Full subscription flow                                |
| `+gm/spotlight/mark`                                          | Staff: manually record a spotlight moment             |
| `+gm/persona/new`, `use`, `clear`, `delete`                   | Full player persona lifecycle                         |
| `+gm/journal/read <id>`                                       | Read a specific journal entry in-game                 |

### PDF library

The spec referenced `pdf-parse`. The actual implementation uses **`unpdf`**
(npm:unpdf), which works with Deno's runtime without Node compatibility shims.

### Open engine issue

[ursamu#57](https://github.com/UrsaMU/ursamu/issues/57): `addPose()` in
`round-manager.ts` does a read-modify-write on the contributions array. Two
simultaneous poses can race. Requires a `$push` atomic op in `DBO.modify()` to
fix properly.
