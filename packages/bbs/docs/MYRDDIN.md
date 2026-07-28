# Myrddin BBS parity (UrsaMU)

Reference: Myrddin Global BBS ~5.2.x softcode.

**Goal:** player/staff *command UX* parity.  
**Non-goal:** softcode objects, bbpocket, SHA1 signing, base-36 ids.

## Command matrix

| Myrddin | UrsaMU | Status |
|---------|--------|--------|
| +bb / +bbread | +bbread, +bb | have |
| +bbnew | +bbnew | **filled** |
| +bbnext | +bbnext | have |
| +bbcatchup | +bbcatchup | have |
| +bbscan | +bbscan | **filled** |
| +bbpost / +bbreply | +bbpost, +bbreply | have |
| +bbproof / +bbtoss | +bbproof, +bbtoss | have |
| +bbedit / +bbremove | +bbedit, +bbremove | have |
| +bbmove | +bbmove | have |
| +bbjoin / +bbleave | +bbjoin, +bbleave | have |
| +bblist | +bblist | have |
| +bbnotify | +bbnotify | have |
| +bbsearch | +bbsearch | have |
| +bbnewgroup | +bbnewgroup | have |
| +bbcleargroup | +bbcleargroup | have |
| +bblock / +bbwritelock | +bblock, +bbwritelock | have |
| +bbtimeout | +bbtimeout | have |
| +bbconfig | +bbconfig | have (global) |
| +bbversion | +bbversion | **filled** |
| +bbhelp | +bbhelp | **filled** |
| +bbcolors / themes | +bbcolors | **filled** (layout note) |
| +bbwrite | use +bbwritelock | N/A staff |
| anonymous groups | +bbanon | **filled** |
| sticky / flag / archive | +bbsticky, +bbflag, +bbarchive | UrsaMU+ |
| webhooks / jobs | +bbwebhook, jobs bridge | UrsaMU+ |

## Deferred (low value)

- Per-player color theme attrs (`_C_1` style)
- Softcode installer / SHA1 integrity
- Exact Myrddin listing glyph art
