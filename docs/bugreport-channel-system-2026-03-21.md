# Bug Report: Channel System — Silent Message Loss on Reconnect

**Date:** 2026-03-21
**Reported by:** Jupiter (game operator)
**Severity:** Medium
**Status:** Fixed

## Symptom

Player was on the Public channel (`pub`), tried to talk, received no output.
Removing from the channel and re-adding fixed it.

## Root Cause

Three bugs in the channel system, all contributing to the same failure mode:

### Bug 1: `channels.ts` — Full object overwrite on channel on/off (MEDIUM)

**File:** `src/services/commands/channels.ts`, lines 49 and 57

When a player toggles a channel on or off, the code saved the **entire player
object** back to the database:

```typescript
await dbojs.modify({ id: en.id }, "$set", en);  // BAD: overwrites all data
```

This could clobber concurrent writes (stats, location, etc.) because `en` was
read at the start of the command and may be stale by the time the save runs.

**Fix:** Save only the channels array:
```typescript
await dbojs.modify({ id: en.id }, "$set", { "data.channels": userChans });
```

### Bug 2: `joinChans.ts` — Double socket join for new channels (LOW)

**File:** `src/utils/joinChans.ts`, lines 36 and 76-78

When a player connects and gets auto-added to a new channel, the code calls
`ctx.socket.join(channel.name)` on line 36 (inside the new-channel block),
then AGAIN on line 77 (in the final loop over all active channels). Harmless
but wasteful.

**Fix:** Removed the individual join on line 36. The final loop at the end
is now the single authoritative join point for all channels.

### Bug 3: `joinChans.ts` — Stale data on reconnect join (MEDIUM)

**File:** `src/utils/joinChans.ts`, lines 76-78

The final socket-join loop used the `player.data.channels` array that was read
at the START of `joinChans`. If the loop above modified channels (adding or
removing entries and saving to DB), the in-memory `player` object was stale.
The socket joins could use outdated channel data.

Additionally, if the WebSocket wasn't fully ready when `joinChans` ran
(race condition on reconnect), the `ctx.socket.join()` calls would silently
fail, leaving the player's socket disconnected from channel rooms. The player
would appear "on" the channel in the DB but never receive messages.

**Fix:** Re-read the player from the database after all modifications, then
join all active channels from the fresh data. This ensures the socket is
always in sync with the DB state.

### Bug 4: `channels.ts` — Empty messages sent to channel (LOW)

**File:** `src/services/commands/channels.ts`, line 22

If a player typed just the channel alias with no message (e.g. `pub` with no
text), the code built `says, ""` and broadcast an empty quote to the channel.

**Fix:** Added an empty-message check after the on/off toggle block. If `msg`
is empty after trimming, the command returns true (consumed) without sending.

### Bug 5: `channels.ts` — Strict equality on `active` toggle (LOW)

**File:** `src/services/commands/channels.ts`, lines 46 and 53

The on/off toggle used `channel?.active === false` and `=== true`. If
`active` was `undefined` (never explicitly set), neither branch matched.
A player typing `pub on` would get no response and no toggle.

**Fix:** Changed to loose checks: `!channel.active` for on, `channel.active`
for off. Now `undefined` is treated as inactive.

### Bug 6: `channels.ts` — Departure announced before state change (LOW)

**File:** `src/services/commands/channels.ts`, line 54

The "off" path called `force()` to announce departure BEFORE setting
`active = false` and leaving the channel room. If the forced message triggered
`matchChannel` recursively, the channel was still active and could process the
announcement as a real message.

**Fix:** Moved `channel.active = false` and `ctx.socket.leave()` before the
`force()` departure announcement.

### Bug 7: `channels.ts` — History trim on every message (LOW)

**File:** `src/services/commands/channels.ts`, lines 93-101

Every message sent to a logged channel triggered a full scan of ALL history
entries for that channel, sorted them, and deleted extras one by one. On a
busy channel with 500+ messages, this was a full table scan + N delete
operations on every single message.

**Fix:** Trim only runs probabilistically (~2% of messages). Over time
the history stays bounded without the per-message performance cost.

### Bug 8: `system/scripts/channels.ts` — No error handling on join/leave (LOW)

**File:** `system/scripts/channels.ts`, lines 24-25 and 34-35

The `@channel/join` and `@channel/leave` commands called `u.chan.join()` and
`u.chan.leave()` then unconditionally sent a success message. If the underlying
call threw (e.g. channel doesn't exist, permission denied), the player still
saw "You have joined..." even though they didn't.

**Fix:** Wrapped both calls in try/catch. On failure, the player now sees the
error message instead of a false success confirmation.

## Files Changed

- `src/services/commands/channels.ts` — lines 46, 53, 54, 22, 93-101
- `src/utils/joinChans.ts` — lines 36, 76-78
- `system/scripts/channels.ts` — lines 24-25, 34-35
