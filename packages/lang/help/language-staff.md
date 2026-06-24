+LANGUAGE-STAFF

Staff-only switches for the +language command. Standard players see
+help language instead.

SWITCHES

  +language/learn <player>=<lang>/<n>     (admin or wizard)
    Set <player>'s skill in <lang> to <n> (clamped 0-100).
    Example:
      +language/learn Alice=huttese/75
      +language/learn me=shyriiwook/0   (known, but no skill)

  +language/reload                        (wizard)
    Re-scan the languages directory and re-bake say.ts/pose.ts.
    Reports validation errors inline. Safe to run any time.

NOTES

  - The plugin overrides system/scripts/say.ts and pose.ts at install
    time. Backups are saved as *.original.ts.
  - Skill changes apply immediately; no need to reload.
  - Reload is only needed after editing language JSON files on disk.

SEE ALSO: +help language, +help language-authoring
