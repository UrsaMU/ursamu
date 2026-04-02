SOFTCODE OBJECT FUNCTIONS

Object references accepted by most functions:
  me       The executor (object whose attribute is running)
  here     The room containing the executor
  #<n>     Object by dbref number
  <name>   Object by name (connected players only for players)
  #<tag>   Named tag (global or personal)

See also: softcode/index, softcode/output, softcode/time

-------------------------------------------------------------------------------
IDENTITY
-------------------------------------------------------------------------------

name(<obj>)
  The name of obj. > [name(me)] → Alice

fullname(<obj>)
  Full name of obj (may include aliases or title).

dbref(<obj>)
  The dbref of obj as "#N". > [dbref(me)] → #1

num(<obj>)
  Alias for dbref().

type(<obj>)
  The type string: PLAYER, ROOM, EXIT, or THING.
  > [type(me)] → PLAYER   [type(here)] → ROOM

hastype(<obj>,<type>)
  Returns 1 if obj is of the given type.
  > [hastype(me,player)] → 1

moniker(<obj>)
  The display name (moniker) of obj, or name if no moniker is set.

accname(<obj>)
  Returns the objective pronoun for obj: "him", "her", or "it".

unparse(<obj>)
  Returns "Name(#dbref)" format, e.g. "Alice(#1)".

valid(<str>)
  Returns 1 if str is non-empty. Used as a generic existence check.

isdbref(<str>)
  Returns 1 if str looks like a valid dbref (#N).
  > [isdbref(#5)] → 1   [isdbref(hello)] → 0

isobjid(<str>)
  Alias for isdbref().

-------------------------------------------------------------------------------
FLAGS
-------------------------------------------------------------------------------

flags(<obj>)
  Returns a string of flag codes set on obj.
  > [flags(me)] → Pc  (Player, connected)

lflags(<obj>)
  Returns a space-separated list of full flag names.
  > [lflags(me)] → player connected

hasflag(<obj>,<flag>)
  Returns 1 if obj has the named flag.
  > [hasflag(me,player)] → 1   [hasflag(me,wizard)] → 0

haspower(<obj>,<power>)
  Returns 1 if obj has the named power.
  Powers are defined by the game configuration.

powers(<obj>)
  Returns a space-separated list of powers held by obj.

-------------------------------------------------------------------------------
ATTRIBUTES
-------------------------------------------------------------------------------

hasattr(<obj>,<attr>)
  Returns 1 if obj has the named attribute set.
  > [hasattr(me,DOING)] → 1

hasattrp(<obj>,<attr>)
  Like hasattr but also checks parent chain.

lattr(<obj>[,<pattern>])
  Space-separated list of attribute names on obj.
  Optionally filtered by glob pattern.
  > [lattr(me)] → DOING SEX GREETING

lattrcmds(<obj>[,<pattern>])
  List of $command attributes on obj.

lattrp(<obj>[,<pattern>])
  Like lattr but includes inherited attributes from parent chain.

attrcnt(<obj>[,<pattern>])  / nattr(<obj>[,<pattern>])
  Count of attributes on obj.
  > [attrcnt(me)] → 3

get(<obj>/<attr>)
  Returns the raw value of the attribute.
  > [get(me/DOING)] → exploring the world

xget(<obj>,<attr>)
  Like get() but takes obj and attr as separate arguments.
  > [xget(me,DOING)] → exploring the world

get_eval(<obj>/<attr>)
  Retrieves and evaluates the attribute as softcode.

v(<attr>)
  Returns the value of <attr> on the executor (me).
  > [v(DOING)] → exploring the world

default(<obj>/<attr>,<default>)
  Returns attribute value if set, otherwise returns <default>.
  > [default(me/SCORE,0)] → 0  (if SCORE not set)

edefault(<obj>/<attr>,<default>)
  Like default() but evaluates the attribute if found.

udefault(<obj>/<attr>,<default>[,<args>...])
  Calls u(obj/attr,args...) if attr exists, otherwise returns <default>.

-------------------------------------------------------------------------------
USER-DEFINED FUNCTIONS
-------------------------------------------------------------------------------

u(<obj>/<attr>[,<arg0>[,<arg1>...]])
  Calls the softcode stored in <obj>/<attr>, passing args as %0, %1, etc.
  %! inside the attribute = obj. %@ inside = the calling executor.
  > [u(me/DOUBLE,5)] → 10  (if DOUBLE is [mul(%0,2)])

ulocal(<obj>/<attr>[,<args>...])
  Like u() but registers are isolated (localize() applied automatically).
  Changes to %q0–%qz inside the attribute do not affect the caller.

eval(<str>) / s(<str>) / subeval(<str>)
  Evaluates a string as softcode. See softcode/logic.

objeval(<obj>,<str>)
  Evaluates softcode in the context of another object.

zfun(<attr>[,<args>...])
  Calls attr on the executor's zone master object.

-------------------------------------------------------------------------------
LOCATION
-------------------------------------------------------------------------------

loc(<obj>)
  Returns the dbref of obj's location (room or container).
  > [loc(me)] → #10

home(<obj>)
  Returns the dbref of obj's home location.

owner(<obj>)
  Returns the dbref of the object's owner.

parent(<obj>)
  Returns the dbref of obj's parent, or #-1 if none.

lparent(<obj>)
  Space-separated list of all objects in the parent chain.

children(<obj>)
  Space-separated list of all objects whose parent is obj.

zone(<obj>)
  Returns the dbref of obj's zone master, or #-1 if none.

inzone(<obj>)
  Returns 1 if obj is in any zone.

where(<obj>)
  Returns the dbref of the room containing obj (resolves containers).

rloc(<obj>,<depth>)
  Recursively finds the location at <depth> levels up.
  rloc(obj,1) = loc(obj), rloc(obj,2) = loc(loc(obj)), etc.

room(<obj>)
  Returns the dbref of the room ultimately containing obj.

lrooms()
  Space-separated list of all room dbrefs in the database.

-------------------------------------------------------------------------------
CONTENTS
-------------------------------------------------------------------------------

lcon(<obj>[,<type>])
  Space-separated list of dbrefs of objects inside obj.
  Optionally filtered by type (PLAYER, THING, EXIT).
  > [lcon(here)] → #1 #2 #3

con(<obj>)
  Returns the dbref of the first object inside obj (head of contents list).

lexits(<obj>)
  Space-separated list of exit dbrefs in obj.

exit(<obj>)
  Returns the dbref of the first exit in obj.

next(<obj>)
  Returns the dbref of the next object in the same location.

ncon(<obj>)
  Count of objects inside obj.

nexits(<obj>)
  Count of exits in obj.

-------------------------------------------------------------------------------
PLAYER FUNCTIONS
-------------------------------------------------------------------------------

lwho()
  Space-separated list of dbrefs of all connected players.
  > [lwho()] → #1 #2 #5

lplayers([<room>])
  Space-separated list of dbrefs of connected players.
  Without argument: all connected players (like lwho but explicit).
  With <room>: only players currently in that room.
  > [lplayers(here)] → #1 #2

nplayers()
  Count of all connected players.

nrooms()
  Count of all rooms in the database.

nobjects()
  Count of all objects in the database.

pmatch(<name>)
  Returns the dbref of the connected player matching <name>,
  or #-1 if no match / ambiguous.
  > [pmatch(alice)] → #1

pfind(<name>)
  Like pmatch() but also searches offline players.

locate(<looker>,<str>,<type>)
  General-purpose object search. <type> is a string of flags:
  P=player, R=room, E=exit, T=thing.

match(<list-or-obj>,<pattern>)
  Returns position of first matching item in a list, or dbref match.

conn(<player>)
  Seconds since <player> connected. Returns -1 if not connected.
  Returns 0 if connected but connection time is unavailable.
  > [conn(me)] → 0   [conn(#99)] → -1

idle(<player>)
  Seconds since <player> last typed a command. Returns -1 if not connected.

doing(<player>)
  Returns the DOING attribute of <player> (shown in WHO list).

host(<player>)
  Returns the hostname/IP of the player's connection. (Not available in this version.)

ports(<player>)
  Returns the port numbers for the player's connection. (Not available in this version.)

lports()
  Returns all active port numbers. (Not available in this version.)

cwho(<channel>)
  Returns connected players on <channel>.

-------------------------------------------------------------------------------
SEARCH
-------------------------------------------------------------------------------

lsearch(<type>[,<attr>[,<val>[,<owner>]]])
  Returns a space-separated list of dbrefs matching search criteria.
  > [lsearch(PLAYER)] → all player dbrefs
  > [lsearch(THING,,me)] → things owned by me (any attr)

search(<type>[,<attr>[,<val>]])
  Alias for lsearch() without owner filter.

nsearch(<type>[,<attr>[,<val>[,<owner>]]]) / nlsearch(...)
  Returns the COUNT of matching objects rather than their dbrefs.
  > [nsearch(PLAYER)] → 5

-------------------------------------------------------------------------------
PERMISSIONS
-------------------------------------------------------------------------------

controls(<actor>,<target>)
  Returns 1 if <actor> controls <target> (owns it or is wizard/admin).
  > [controls(me,here)] → 0  (if you don't own the room)

visible(<looker>,<target>)
  Returns 1 if <looker> can see <target>.
  DARK objects are hidden from non-owners who are not wizard/admin.

findable(<looker>,<target>)
  Returns 1 if <looker> can find <target> by name search.
  UNFINDABLE objects are hidden from non-owners.

nearby(<obj1>,<obj2>)
  Returns 1 if both objects are in the same room.

-------------------------------------------------------------------------------
MONEY
-------------------------------------------------------------------------------

money(<obj>)
  Returns the coin/money value stored in obj's data.money field.
  > [money(me)] → 100

-------------------------------------------------------------------------------
CHANNELS / MAIL
-------------------------------------------------------------------------------

channels(<player>)
  Comma-separated list of channels <player> is subscribed to.

lchannels()
  Space-separated list of all channel names.

chanobj(<channel>)
  Returns #-1. (Channel objects not implemented in this version.)

mail(<player>)
  Returns the unread mail count for <player>.
  > [mail(me)] → 3

mailfrom(<n>)   Subject of message n. (Not available in this version.)
mailsize(<n>)   Size of message n. (Not available in this version.)
mailsubj(<n>)   Subject line. (Not available in this version.)
mailj(<n>)      Mail flags. (Not available in this version.)

-------------------------------------------------------------------------------
QUEUE / MEMORY
-------------------------------------------------------------------------------

qlength([<obj>])
  Number of pending queue entries for obj (default: executor).

objmem(<obj>)   Memory used by obj. Returns 0 (not available).
playmem(<obj>)  Memory used by player. Returns 0 (not available).
