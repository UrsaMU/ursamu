# Anomaly Jobs parity (UrsaMU `@ursamu/jobs` 1.0)

Reference: Anomaly Jobs ~6.5 softcode help surface.

**Goal:** staff/player *workflow* parity with Anomaly.  
**Non-goal:** softcode objects, JGO/VA/VB/VC installer, BBS
auto-post letter attrs, full `+jobs/select` boolean DSL (v1.1+).

## 1.0 cut — must have

| Anomaly | UrsaMU 1.0 |
|---------|------------|
| +jobs / +jobs/all | +jobs, +jobs/all |
| +jobs/mine | +jobs/mine |
| +jobs/new | +jobs/new |
| +jobs/overdue | +jobs/overdue |
| +jobs/from <player> | +jobs/from |
| +jobs/who <player\|none> | +jobs/who |
| +jobs/list <bucket> | +jobs/list, +job/bucket |
| +jobs/pri | +jobs/pri |
| +jobs/due | +jobs/due |
| +jobs/date | +jobs/date |
| +jobs/sort | +jobs/sort (by bucket) |
| +jobs/catchup | +jobs/catchup |
| +jobs/search | +jobs/search |
| +job <#> | +job <#> |
| +job/add | +job/add (= comment) |
| +job/create | +job/create |
| +job/assign | +job/assign |
| +job/complete | +job/complete (= close) |
| +job/approve / deny | +job/approve, +job/deny |
| +job/due | +job/due |
| +job/status / progress | +job/status |
| +job/esc / pri | +job/esc |
| +job/hold | +job/hold |
| +job/tag | +job/tag |
| +job/access | +job/access (viewer toggle) |
| +request / myjobs | +request, +myjobs |
| bug / typo / pitch | +bug, +typo, +pitch |
| silence / nospam | +jobs/silence, +jobs/nospam |
| buckets access | +job/addaccess, listaccess |
| hooks | jobHooks (create/comment/…) |
| mail on actions | sendJobMail when mail present |
| archive | +archive |

## Deferred (1.1+)

- Full +jobs/select boolean expressions + JOBSELECT attrs
- jgroups player lists
- form letters (a/b/m/p) + auto BBS posts
- +jobs/reports suite
- +jobs/compress, +jobs/clean
- bucket summary / sumset
- softcode TRIG_* / HOOK_* on objects
- publication per-comment +/− UI (flags exist; expand later)

## Standards note

Meet Anomaly **standards** = same *jobs people do every day*,
not byte-for-byte softcode. Listing chrome uses engine layout
where practical.
