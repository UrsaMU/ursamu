See also: +help attrs (overview)

+WIPE

  Remove attributes whose names match a pattern. Requires
  canEdit. Use carefully.

SYNTAX
  @wipe <target>=<pattern>

  Pattern may be a glob understood by the wipe script
  (example: `TEMP*`).

EXAMPLES
  @wipe me=TEMP*
  @wipe here=OLD_*

SEE ALSO: +help attrs/set, +help objects/examine
