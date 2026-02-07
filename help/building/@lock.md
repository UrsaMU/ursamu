@LOCK

COMMAND: @lock[/<switch>] <object>=<key>

Sets a lock on <object> to restrict access or usage based on the <key>. The
<key> is a boolean expression composed of objects, flags, and attributes.

Switches: /Basic (Default) - Basic lock (pickup/traverse). /Enter - Enter lock.
/Use - Use lock. /Page - Page lock. /Tell - Tell lock. /Speech - Speech lock.
/Drop - Drop lock. /Give - Give lock. /User - User-defined lock (requires
specific checking code).

Examples: @lock me=*friend @lock/enter home=+friend @lock/use lever = *admin |
+wizard

Related Topics: @unlock, locks, @flags
