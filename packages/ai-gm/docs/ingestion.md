# ai-gm — Game Book Ingestion

The ingestion pipeline reads your game books (PDF, TXT, or Markdown) and
configures the GM automatically — no code changes needed.

## How It Works

```
books/game.pdf
      │
      ▼
  watcher.ts       Detects new/changed files via Deno.watchFs
      │
      ▼
  extractor.ts     PDF/TXT/MD → ITextChunk[]
      │
      ▼
  analyzer.ts      LangGraph agent: extract rules per chunk
      │
      ▼
  synthesizer.ts   Vote/merge extractions → IGameSystemDraft
      │
      ▼
  reviewer.ts      In-game admin review flow — staff approve or adjust
      │
      ▼
  systems/store    IGameSystem saved to DB and registered immediately
```

Document content is isolated with `<book-text>` XML delimiters in every LLM
prompt to prevent prompt injection from adversarial PDFs.

## Walkthrough

### 1. Add books

Drop PDF, TXT, or Markdown files into your books directory (default `./books/`).
Configure a different path with `+gm/config/booksdir <path>`.

Files are watched automatically — drop a file in and ingestion starts within a
few seconds. Or trigger manually:

```
+gm/ingest
```

### 2. Wait for the review page

The AI pages all admin-flagged players with a summary:

```
[AI-GM] Finished reading: shadowrun-4e.pdf

  Game:           Shadowrun (4th Edition)
  Stats:          Body, Agility, Reaction, Strength, Willpower, Logic, Intuition, Charisma, Edge
  Full success:   4+ hits
  Partial:        1–3 hits
  Miss:           0 hits
  Hard moves:     12 found
  Soft moves:     8 found

I have 2 item(s) that need your review:

[1] moveThresholds.fullSuccess
    Found: 4 / 5  (from: core-rules.pdf, sr4-gm-screen.pdf)
    Recommendation: 5
    Resolve:  +gm/ingest/review abc123/item1=4
    Skip:     +gm/ingest/review abc123/item1/skip
```

### 3. Resolve flagged items

For each item the AI is uncertain about, either set your own value or accept the
suggestion:

```
+gm/ingest/review abc123/item1=4     — use your value
+gm/ingest/review abc123/item1/skip  — accept AI suggestion
```

### 4. Approve or reject

```
+gm/ingest/approve abc123   — activate the system
+gm/ingest/reject abc123    — discard it
```

Approval registers the system immediately. No restart needed.

### 5. Switch to the new system

```
+gm/config/system shadowrun-4th-edition
```

Or it activates automatically on the next `+gm/session/open`.

## Multiple Sources

You can drop multiple books covering the same game. The synthesizer votes across
all extractions — items where sources disagree are flagged for your review. More
sources generally means higher confidence.

## Check Status

```
+gm/ingest/status                  — show current job status
+gm/ingest/transcript <jobId>      — view the full AI setup transcript
```
