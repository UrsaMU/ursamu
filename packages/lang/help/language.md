+LANGUAGE

Manage which languages your character knows and which one you are
actively speaking. While you have an active language, your normal
`say` and `pose` are intercepted: each listener in the room sees the
quoted speech garbled in proportion to their own skill in your
language. Action text outside double-quotes is never garbled.

SYNTAX
  +language
  +language/speak <name>
  +language/clear
  +language/list
  +language/learn <player>=<language>/<0-100>   (staff)
  +language/reload                              (wizard)

EXAMPLES
  +language                          Show your known languages.
  +language/speak shyriiwook         Start speaking Shyriiwook.
  say Get out of my forest.          Listeners hear it garbled.
  pose growls and says "Leave us."   Action clear; quoted text garbled.
  +language/clear                    Stop, speak normally again.

TIERS
  Skill 0       — fully garbled, only word/punctuation count survives.
  Skill 1-25    — fully garbled, but original syllable rhythm preserved.
  Skill 26-60   — ~30% of words pass through with a light accent.
  Skill 61-90   — ~70% of words pass through with a light accent.
  Skill 91-100  — clear speech.

  Two listeners at the same tier see the same garbled string — output
  is deterministic per (word, language, tier).

SEE ALSO: +help say, +help pose, +help language-authoring, +help language-staff
