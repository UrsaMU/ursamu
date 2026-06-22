# Engine hardening — 2026-06-22

Read-only engine audit (services, commands, routes, utils, lifecycle, sandbox)
followed by fixes. Plugins excluded. All changes type-check, lint clean, and the
full test suite shows **zero regressions** (1265 passed / 34 pre-existing
environment failures — identical set before and after; the pre-existing failures
are Windows symlink limits, a CSP config test, and plugin-CLI subprocess tests).

## Fixes (deployed to server)

1. **Lock evaluator fails closed on error** — `src/utils/evaluateLock.ts`
   `evaluateLock()` now wraps `parseLock` in try/catch and returns `false` on any
   error. Previously a throwing `[...]` lock *script* escaped as a rejected
   promise into the command-dispatch path (lock *functions* were already caught
   via `callLockFunc`). Now both deny on error.

2. **DB query cache is coherent across handles** — `src/services/Database/database.ts`
   The 500 ms query cache is now **static, keyed by collection prefix**, so every
   `new DBO(prefix)` handle shares one cache. Previously the cache was per-instance,
   so a write through one handle left another handle's cache stale for up to 500 ms.
   Fixes the real instances (`mail.messages` opened in nuke.ts + test.ts;
   `server.gameclock` opened twice in GameClock) and any future duplicate.

3. **`$inc` no longer corrupts non-numeric fields** — `database.ts`
   Coerces the *current* stored value to a number before adding, so a field that
   is accidentally a string (`"5"`) increments to `6` instead of concatenating to
   `"51"`. Also applies the `isDangerousKey` prototype-pollution guard to `$inc`
   for consistency with `$set/$unset/$push/$pull`.

4. **`$pull` matches nested-object criteria** — `database.ts`
   `pullMatches` now recurses, so `$pull { arr: { meta: { x: 1 } } }` matches by
   value. Flat-primitive criteria (the common case) are unchanged.

5. **Regex queries don't false-match missing fields** — `database.ts`
   `matchesQuery` returns no-match for `null`/`undefined` fields instead of testing
   the literal string `"undefined"`.

6. **Rate-limit cleanup timers no longer hold the process open** —
   `src/app.ts`, `src/routes/authRouter.ts`
   The two module-level `setInterval` sweeps are `Deno.unrefTimer`'d so they never
   keep the event loop alive (clean shutdown; no leaked-timer op in tests).

## Fixes (committed, NOT deployed — no production impact)

7. **Signal listeners registered once** — `src/main.ts`
   SIGINT/SIGTERM listeners are now registered a single time per process and
   dispatch to the latest shutdown closure, instead of accumulating one pair per
   `initializeEngine()` call. Only affects re-init/hot-reload/tests — production
   inits once. **Not deployed**: the server runs a server-specific `main.ts`
   (excluded from engine deploys); this change lives in git only.

## Cleanup

8. **Deleted `src/_dup_src_BACKUP/`** — 162 tracked files, a stale duplicate of
   `src/`, imported by nothing. Repo hygiene only.

## Reviewed, intentionally left as-is

- **Sandbox `Deno.exit` handlers** (`sandbox-handlers-sys.ts` sys:update/reboot/
  shutdown) are all `actorIsAdmin`-gated — verified safe, no change.
- **Query cache full-clear on write** is the *correct* behavior; targeted
  invalidation would risk stale reads. Left unchanged.

---

# Engine performance pass — 2026-06-22 (round 2)

Second scan, focused on performance (areas only sampled in round 1: the commands,
utils, softcode/sandbox internals, routes). All changes type-check, lint clean,
and the full suite shows **zero regressions** (identical pass/fail set).
**Status: NOT deployed / NOT pushed yet** — staged locally for review.

1. **Throttle the per-command `lastCommand` write** —
   `src/services/commands/pipeline-stages.ts`
   Every matched command wrote a `lastCommand` timestamp (a CAS DB write) on the
   hottest path, which also cleared the query cache each command (defeating it
   during active play). `lastCommand` only feeds the WHO idle display, which needs
   only coarse granularity — now persisted at most once per 5 s
   (`LAST_COMMAND_THROTTLE_MS`); the in-memory value stays exact for the dispatch.
   Big reduction in command-path writes; the query cache becomes useful again.

2. **`/scenes/locations` no longer scans the whole object table** —
   `src/routes/sceneRouter.ts`
   Replaced `dbojs.query({})` + JS room-filter (a full scan on every request, with
   leftover debug comments) with `dbojs.query({ flags: /\broom\b/i })` so the DB
   layer narrows and caches it.

3. **Cache compiled regexes in `switchWildcard`** —
   `src/commands/softcode/shared.ts`
   `@switch` wildcard comparisons recompiled a regex every call; now compiled once
   per pattern via a bounded cache (no "g" flag → stateless, safe to reuse).

4. **Cache compiled regexes in the softcode string stdlib** —
   `src/services/Softcode/stdlib/string.ts`
   `globMatch`, `safeRegex`, `safeRegexExec` now share a bounded compiled-regex
   cache (also caches compile failures so bad patterns aren't retried).
   `buildRe` is deliberately left uncached — it uses the global flag whose
   `lastIndex` state must not be shared.

5. **InterceptorService: serialize the intent once + fast-path** —
   `src/services/Intents/InterceptorService.ts`
   Was `parse(stringify())` then `stringify()` again **per candidate**. Now: return
   immediately when there are no interceptors (the common case — zero work), and
   serialize the loop-invariant intent a single time (guarded, so a non-
   serializable intent can't throw past the loop).

## Round 2 — reviewed, deferred (with reason)

- **Softcode regex ReDoS guard** — the `grep` command rejects catastrophic
  patterns; the softcode `regmatch`/`globMatch` helpers don't. Left as-is: it's
  bounded by the 10 s sandbox timeout, softcode is builder-authored, and adding
  the guard could reject patterns existing softcode relies on.
- **Duplicate `escapeRegex` helper** in 5 files (alias/search/authRouter/
  findPlayerByLogin/objects) vs the shared `src/utils/escapeRegex.ts` — pure DRY,
  no behavior change; deferred to avoid churn.

---

# Engine scan — 2026-06-22 (round 3)

Third pass — softcode engine, sandbox internals, stdlib, parser, leak/loop
audit. **Result: the engine is in excellent shape** — almost everything checked
was already well-guarded (see "verified clean" below). Two minor fixes applied;
type-check + lint clean, full suite zero regressions. **NOT deployed / pushed.**

1. **Sweep the sandbox auth rate-limit map** —
   `src/services/Sandbox/sandbox-handlers-db.ts`
   `_authRateLimits` (per-actor limiter for sandbox `auth:verify`/`auth:hash`) had
   no eviction — an actor who triggered it once left a permanent entry, so the map
   grew (slowly, bounded by distinct players) for the life of the process. Its two
   sibling rate-limit maps (`app.ts`, `authRouter.ts`) already sweep; added the
   same unref'd 60 s sweep here for consistency.

2. **`extract()` clamps invalid positions** —
   `src/services/Softcode/stdlib/list.ts`
   `extract(list, 0|negative, n)` let `Array.slice`'s negative-index semantics pull
   from the END of the list. Now returns empty for position < 1 (and len ≤ 0),
   matching how `ldelete`/`insert`/`replace` already guard their indices.

## Round 3 — verified clean (no change needed)
- **Math stdlib**: every divide guards `#-1 DIVISION BY ZERO`; sqrt/ln/log range-
  check; lerp/remap/smoothstep guard degenerate ranges; `num`/`int` default NaN→0;
  `fmt` handles Inf/NaN.
- **List stdlib**: `ldelete`/`delete`/`insert`/`replace` all guard indices; `lnum`
  is capped (10k + per-iteration deadline check) — no generator DoS.
- **Sandbox**: per-request 8 s timeout with cleanup (no hung awaits); `_transpileCache`
  is size-bounded.
- **Loops/leaks**: no `forEach(async …)`, no comparator-less numeric `.sort()`;
  every `while(true)` (supervisor, telnet read) is properly bounded; the supervisor
  has crash-loop detection. Module-level lookup Sets are constants; mutable maps are
  bounded or swept.
