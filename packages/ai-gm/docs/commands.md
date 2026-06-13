# ai-gm — Command Reference

All commands require the `connected` flag unless noted **staff only**
(admin+/wizard).

## Configuration

| Command                          | Description                                                         |
| -------------------------------- | ------------------------------------------------------------------- |
| `+gm`                            | Show GM status and current system                                   |
| `+gm/config`                     | Show full configuration                                             |
| `+gm/config/model <model>`       | Set Gemini model identifier                                         |
| `+gm/config/mode <auto\|hybrid>` | `auto` — GM responds to every round; `hybrid` — staff triggers only |
| `+gm/config/chaos <1–9>`         | Mythic GME chaos factor                                             |
| `+gm/config/system <id>`         | Switch active game system (no restart needed)                       |
| `+gm/config/booksdir <path>`     | Set the books folder path                                           |

## Sessions

| Command                    | Description                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| `+gm/session/open <label>` | Open a GM session for the current room                                |
| `+gm/session/close`        | Close session — auto-generates a journal entry                        |
| `+gm/reload`               | Invalidate context cache (forces re-load of characters, fronts, etc.) |

## Room & Player Management — staff only

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `+gm/watch`               | Add current room to the GM watch list   |
| `+gm/unwatch`             | Remove current room from the watch list |
| `+gm/ignore <playerId>`   | Stop the GM responding to a player      |
| `+gm/unignore <playerId>` | Restore GM responses for a player       |

## GM Actions — staff only

| Command                                 | Description                                              |
| --------------------------------------- | -------------------------------------------------------- |
| `+gm/go`                                | Manually trigger round adjudication for the current room |
| `+gm/oracle[/<probability>] <question>` | Ask the GM oracle a yes/no question                      |
| `+gm/move <move>=<total>`               | Submit a completed roll for adjudication                 |
| `+gm/scene/publish <text>`              | Broadcast a narration to the current room                |

**Oracle probability switches:** `certain` · `very-likely` · `likely` · `50-50`
· `unlikely` · `very-unlikely` · `impossible`

## Game Book Ingestion — staff only

| Command                                      | Description                                      |
| -------------------------------------------- | ------------------------------------------------ |
| `+gm/ingest`                                 | Manually trigger ingestion pipeline              |
| `+gm/ingest/status`                          | Show current job status                          |
| `+gm/ingest/transcript <jobId>`              | View the full setup conversation                 |
| `+gm/ingest/review <jobId>/<itemId>=<value>` | Resolve an uncertain item with your own value    |
| `+gm/ingest/review <jobId>/<itemId>/skip`    | Accept the AI's suggestion for an uncertain item |
| `+gm/ingest/approve <jobId>`                 | Activate the ingested system                     |
| `+gm/ingest/reject <jobId>`                  | Discard the ingested system                      |

See [ingestion.md](ingestion.md) for a full walkthrough.

## Monetization

| Command                       | Who    | Description                                         |
| ----------------------------- | ------ | --------------------------------------------------- |
| `+gm/credits`                 | Anyone | Show balance and recent ledger                      |
| `+gm/credits/buy <n>`         | Anyone | Purchase credits — generates a Stripe checkout link |
| `+gm/credits/grant <pid> <n>` | Staff  | Grant credits to a player                           |
| `+gm/sub`                     | Anyone | Show subscription status                            |
| `+gm/sub/plans`               | Anyone | List available subscription plans                   |
| `+gm/sub/start <planId>`      | Anyone | Subscribe (free tier: instant; paid: Stripe link)   |
| `+gm/sub/cancel`              | Anyone | Cancel current subscription                         |

Default plans: **Observer** (free, 5 credits/month) · **Player**
($4.99, 50/month) · **Patron** ($14.99, 200/month). Default costs: oracle query
= 1 credit · move adjudication = 1 credit · all else = free.

See [monetization.md](monetization.md) for plan customisation and cost tuning.

## Social Features

| Command                           | Description                                             |
| --------------------------------- | ------------------------------------------------------- |
| `+gm/journal`                     | List recent campaign journal entries                    |
| `+gm/journal/read <id>`           | Display a journal entry                                 |
| `+gm/spotlight [<playerId>]`      | Show spotlight moments                                  |
| `+gm/spotlight/mark <pid> <text>` | Staff: manually record a spotlight moment               |
| `+gm/persona`                     | List your personas                                      |
| `+gm/persona/new <name>[=<desc>]` | Create a persona                                        |
| `+gm/persona/use <id>`            | Activate a persona (name shown to GM and other players) |
| `+gm/persona/clear`               | Revert to your player name                              |
| `+gm/persona/delete <id>`         | Delete a persona                                        |
