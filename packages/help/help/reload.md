---
topic: "+help/reload"
section: general
---
# +help/reload

Clears the file-provider cache and rescans all registered help directories.

## Syntax
  `+help/reload`

## Notes
- Use after adding or editing `.md` files in any `help/` folder without
  restarting the server.
- The cache rebuilds automatically on the next lookup after a reload.
- Only affects file-based topics. Database entries (`+help/set`) are
  read live and are never cached.

## Examples
  `+help/reload`

## See Also
  +help/set
