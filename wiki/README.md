# Wiki

This directory is the wiki content root. Files and folders here map directly
to REST API paths under `/api/v1/wiki/` and to in-game `+wiki` paths.

## Structure

```
wiki/
  news/           → +wiki news  /  GET /api/v1/wiki/news
    index.md      → +wiki news  (landing page for the section)
    2026-03-18-battle.md  → +wiki news/2026-03-18-battle
  fiction/
    ...
  lore/
    ...
```

## File format

Each `.md` file uses YAML frontmatter:

```markdown
---
title: My Page Title
date: 2026-03-18
author: Alice
tags: [news, combat]
sticky: true
---

Page content here. Plain text or Markdown — your choice.
```

All frontmatter fields are optional except `title` (used in listings).
`index.md` in any folder becomes the landing page for that folder's URL.
