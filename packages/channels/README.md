# @ursamu/channels

Chat channel system for UrsaMU. Provides player-aliased channels with
history, transcripts, and admin management.

## What it does

- `@channel`, `@channel/join`, `@channel/leave` — player channel management
- `@addcom` / `@delcom` / `@allcom` / `@clearcom` / `@comtitle` — alias management
- `@chancreate` / `@chandestroy` / `@chanset` — admin channel administration
- `@chanhistory` / `@chantranscript` — history and export
- `matchChannel` middleware — intercepts alias shortcuts (e.g. `pub Hello`)
- `joinChans` — auto-joins eligible channels on player login

## Install

```typescript
import { channelsPlugin } from "@ursamu/channels";
import { registerPlugin } from "@ursamu/core";

registerPlugin(channelsPlugin);
```

## Usage

```typescript
// In your server entry point:
import { channelsPlugin } from "jsr:@ursamu/channels";
import { registerPlugin } from "jsr:@ursamu/mush";

registerPlugin(channelsPlugin);
```

Players join channels with `@channel/join Public=pub`, then talk with `pub Hello`.

## Requirements

- `@ursamu/mush` >= 0.1.0
- `@ursamu/core` >= 0.1.0
