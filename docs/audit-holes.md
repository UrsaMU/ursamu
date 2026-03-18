# UrsaMU — Known Holes & Incomplete Implementations

Audit of missing side effects, stub code, and incomplete features found via static analysis.
Items are ordered by severity within each category.

---

## HIGH — Player Experience Broken

### 1. Teleport: no auto-look, no room broadcasts
**Files:** `system/scripts/teleport.ts:49`, `system/scripts/home.ts:13`,
`src/services/Sandbox/SandboxService.ts:59-67`

`u.teleport()` only updates the location in memory. It does not:
- Broadcast `"X has left."` to the source room
- Broadcast `"X has arrived."` to the destination room
- Trigger auto-look for the moved player

`teleport.ts` even has a comment claiming "SandboxService handles the actual movements and look" — it doesn't.
`home.ts` has the same gap.

---

### 2. Disconnect broadcast targets everyone, with dummy room data
**File:** `src/services/WebSocket/index.ts:132-139`

When a player disconnects the `close` event fires `this.broadcast()` (all connected clients, not just
the room) and the payload includes a hardcoded dummy room:

```ts
room: { name: "", desc: "", exits: [], players: [], items: [] } // dummy
```

Should target only players in the disconnected player's room and include real room state.

---

### 3. Broadcast `exclude` parameter is silently ignored
**File:** `src/services/broadcast/broadcast.ts`

`send()` accepts `_exclude: string[]` but never uses it. Commands like `get.ts` and `drop.ts`
correctly pass `{ exclude: [actor.id] }` to avoid double-messaging the actor, but it has no effect —
the actor sees their own action twice (once from `u.send`, once from `u.broadcast`).

---

### 4. Give command: money field path wrong, no room broadcast
**File:** `system/scripts/give.ts:39-40`

Money deduction/addition uses `"state.money"` but the actual DB field is under `data`. Transfers
may not persist. Also, room bystanders see nothing — only actor and target receive messages.

---

## MEDIUM — Incomplete Behaviour

### 5. Movement: failed exit attempt may not reach other players
**File:** `src/services/commands/movement.ts:67-68`

Sends failed-movement messages to players via `#<id>` strings, but `send()` expects socket IDs.
Other players in the room may not receive `"X tries to go North, but fails."`.

---

### 6. Scene invite: only owner can invite (hard-coded "for now")
**File:** `src/routes/sceneRouter.ts:358`

Comment: `// Only owner or allowed can invite? Let's say Owner for now.`
The allowed/co-owner list is never checked.

---

### 7. DB object API: insufficient update validation
**File:** `src/routes/dbObjRouter.ts:64-67`

Comment acknowledges incomplete field validation:
`// Safe update fields? Allow updating 'data' and 'description' for now.`
No permission enforcement on which fields callers may write. Flags and IDs could be overwritten
via the API.

---

### 8. Lock evaluation: only supports exact string equality
**File:** `src/utils/evaluateLock.ts:160`

Comment: `// Simple equality for now.`
Attribute locks only match exact strings. Comparison operators (`>`, `<`, `>=`, `<=`) are not
implemented, limiting attribute-based lock expressions.

---

### 9. Open command: quota write may not persist
**File:** `system/scripts/open.ts:78`

Decrements quota in local state then writes `{ data: { ...actor.state } }`. If `actor.state`
is stale the decrement may be lost. Should write only the changed field.

---

### 10. Link command: dot-notation field paths in `db.modify`
**File:** `system/scripts/link.ts:44,48,58`

Uses `{ "data.dropto": id }` style paths in `db.modify` calls. Whether the database layer
handles dot-notation is untested — it may silently store a literal key named `"data.dropto"`.

---

## LOW — Missing Polish / Design Gaps

### 11. Map service: vertical/relative directions map to (0,0)
**File:** `src/services/Map/index.ts:39`

`u`, `d`, `out`, `in` all map to `{ x:0, y:0 }`. Multi-level or z-axis maps render incorrectly.
Needs a z-axis or explicit skip.

---

### 12. Doing command: status change is silent
**File:** `system/scripts/doing.ts`

Updates the doing message but does not notify the room. Whether bystanders should see
`"X is now: <doing>"` is a design question, but currently there is no option either way.

---

### 13. Moniker command: change is silent
**File:** `system/scripts/moniker.ts`

Display name is updated without any room broadcast. Bystanders see the new name with no
transition message.

---

### 14. Script service: legacy placeholder code
**File:** `src/services/Script/index.ts:41-45`

Contains comments like `"Simplified: Just evaluating code for now to prove connection."` —
appears to be unreachable/unused legacy code. Should be removed or completed.

---

### 15. Pose command: scene search on every pose
**File:** `system/scripts/pose.ts:34-37`

Queries for active scenes matching the current room on every pose. No caching. Could be slow
in rooms with high pose frequency.

---

## Not a Bug — Confirmed Intentional

| Item | Reason |
|---|---|
| `@quit` global disconnect | Handled correctly via WS close event |
| Movement auto-look | Already calls `force(ctx, "look")` after a successful exit |
| Connect auto-look | `u.execute("look")` at end of `connect.ts` |
| Channel talking | Implemented in `channels.ts` via `matchChannel()` |
