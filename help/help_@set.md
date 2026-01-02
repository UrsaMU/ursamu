@SET

COMMAND: @set <object> = <flag> @set <object> = !<flag> @set <object> =
<attribute>:<value>

Sets or unsets flags, or sets attributes on an object.

Flags: To set a flag, specifiy the flag name. To unset a flag, prefix the flag
name with '!'.

Attributes: To set an attribute, specify the attribute name, a colon, and the
value. If the value is empty, the attribute is removed (if it's not a built-in
attribute).

Examples: @set me = WIZARD @set me = !WIZARD @set me = sex:Male @set here =
climate:tropical

Related Topics: flags, @lock
