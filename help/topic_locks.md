@LOCK

Locks are a way to restrict access to objects or commands. They are boolean
expressions that are evaluated against the person or object trying to access the
locked item.

Commands: @lock <object>=<key> - Sets a lock on <object>. @unlock <object> -
Removes a lock from <object>.

Lock Types (Switches): /Basic (Default) - Controls who can pick up an object or
traverse an exit. /Enter - Controls who can enter an object/room. /Use -
Controls who can use an object. /Page - Controls who can page you. /Tell -
Controls who can whisper to you. /Speech - Controls who can speak in a room
(requires AUDITORIUM flag). /Drop - Controls who can drop an object. /Give -
Controls who can give something to the object.

Lock Keys:
<object> - Checks if the enactor is the specified object. *<player> - Checks if
the enactor is the specified player. #<dbref> - Checks if the enactor is the
specified dbref. +<flag> - Checks if the enactor has the specified flag.
<attr>:<value> - Checks if the enactor has the attribute <attr> with value
<value>.

Boolean Operators: & (AND) - Both conditions must be true. | (OR) - At least one
condition must be true. ! (NOT) - The condition must be false. ( ) - Grouping
for precedence.

Examples: @lock my_room = *Guest | +WIZARD @lock/enter my_club = +MEMBER
@lock/use verify_wand = #123 & !+CRIMINAL

See also: @lock, @unlock, flags
