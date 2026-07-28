# jobs system parity (UrsaMU `@ursamu/jobs`)

Reference: jobs system ~6.5 softcode help surface.

**Goal:** staff/player *workflow* parity with classic
MUSH job-tracker UX (lists, claim/close, filters, jgroups).
**Non-goal:** softcode objects, external installers, or
evaluating TRIG_* bodies.

## 1.0 — daily workflow

See CHANGELOG 1.0.0: lists, lifecycle, player presets, prefs, archive.

## 1.1 — advanced (this release)

| | UrsaMU 1.1 |
|---------|------------|
| +jobs/select + boolean | +jobs/select (and/or/not, sort=) |
| JOBSELECT / named | +jobs/select default|save|list |
| +jobs/compress | +jobs/compress (open only) |
| +jobs/clean | +jobs/clean |
| +jobs/reports | +jobs/reports open\|overdue\|… |
| jgroups | +jgroup/* CRUD |
| letters (mail) | plugins.jobs.letters templates |
| BBS letters | optional via existing bbs job-bridge |
| +job/act | +job/act |
| comment +/− | +job/publish + display [n+]/[n-] |
| bucket summary | +jobs/summary <bucket> |
| action hooks | registerJobActionHook(CRE/ADD/…) |

## Still later (1.2+)

- Full select extensions (SEL_* custom criteria registry)
- Form letter BBS board auto-post config UX
- Rich report language (actby=add filters)
- sumset language
- Softcode attribute evaluation

## Standards note

Meet **standards** = same *jobs people do*, not
byte-for-byte softcode.
