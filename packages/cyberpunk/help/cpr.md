+CPR

Staff overrides for Cyberpunk RED. Admin only.
Stat changes recalc HP and Death Save. `/reset` is permanent.

SYNTAX
  +cpr/<switch> <arguments>

SWITCHES
  /stat <t>/<stat>=<n>   Set stat (1-8).
  /skill <t>/<sk>=<n>    Set skill (0-10).
  /role <t>=<role>       Change role.
  /rank <t>=<n>          Role rank (1-10).
  /eb|/rep|/hl <t>=<n>   Set eb, rep, or HL.
  /heal|/info|/reset <t> Heal, dump, or wipe CPR data.

EXAMPLES
  +cpr/stat Rogue/body=8    Set BODY to 8.
  +cpr/heal Rogue           Full restore.

SEE ALSO: +help chargen, +help improve/ip
