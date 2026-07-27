---
topic: "@lock"
section: building
aliases: ["@unlock", "lock", "locks"]
---
+@LOCK

Set or clear a **lock** (access key) on an object. TinyMUX-style keys.

SYNTAX
  @lock[/<type>] <target>=<key>
  @unlock[/<type>] <target>

TYPES (default: basic)
  basic   Pickup / exit traverse
  use     @use / USE
  enter   Enter object or room
  leave   Leave object or room
  drop    Who may drop this
  give    Who may give to this
  page    Who may page you
  link    Who may @link here

EXAMPLES
  @lock north=me
  @lock door=wizard | #2
  @lock/use lever=flag(builder)
  @unlock north

SEE ALSO: +help locks/keys, +help locks/examples,
+help locks/funcs, +help action-attrs
