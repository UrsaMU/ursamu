SOFTCODE SERVER FUNCTIONS

These functions return server-level information. Most are read-only.
Connection tracking stubs return fixed values; see notes below.

See also: softcode/index, softcode/time, softcode/object

-------------------------------------------------------------------------------
SERVER IDENTITY
-------------------------------------------------------------------------------

mudname()
  Returns the name of this game server ("UrsaMU").

version()
  Returns the version string ("UrsaMU/2.x (TinyMUX compat)").

numversion()
  Returns the version packed as an integer: major*1000000 + minor*1000 + patch.
  > [numversion()] → 1009000  (version 1.9.0)

-------------------------------------------------------------------------------
SERVER STATUS
-------------------------------------------------------------------------------

poll()
  Returns the current poll message (empty in this version).

motd()
  Returns the current Message of the Day (empty in this version).

config(<option>)
  Returns the value of a named server config option. (Not available.)

stats()
  Returns a space-separated summary: rooms players exits things garbage total
  > [stats()] → 0 0 0 0 0 0  (not tracked in this version)

dumping()
  Returns 1 if the server is currently writing the database, else 0.
  > [dumping()] → 0

-------------------------------------------------------------------------------
MEMORY (NOT AVAILABLE)
-------------------------------------------------------------------------------

objmem(<obj>)
  Memory (bytes) used by obj. Returns 0.

playmem(<player>)
  Memory (bytes) used by a player object. Returns 0.

-------------------------------------------------------------------------------
CONNECTION TRACKING (PARTIAL)
-------------------------------------------------------------------------------

These functions relate to player connection history. The main conn() and
idle() functions are fully implemented; the historical-aggregate variants
return 0 as the connection data is not persisted between sessions.

conn(<player>)
  Seconds since <player> connected, or -1 if not connected.
  Fully implemented. See softcode/object.

idle(<player>)
  Seconds since <player> last sent a command, or -1 if not connected.
  Fully implemented. See softcode/object.

connlast(<player>)   Seconds since last login. Returns 0.
connmax(<player>)    Longest single connection in seconds. Returns 0.
connnum(<player>)    Total number of connections. Returns 0.
connrecord()         Record simultaneous connections. Returns 0.
conntotal(<player>)  Total accumulated connect time. Returns 0.
connleft(<player>)   Minutes remaining on idle kick. Returns 0.

-------------------------------------------------------------------------------
NETWORK / TERMINAL (NOT AVAILABLE)
-------------------------------------------------------------------------------

host(<player>)    Hostname. Returns empty string.
ports(<player>)   Port number list. Returns 0.
lports()          All active port numbers. Returns empty string.
terminfo(<player>) Terminal capabilities. Returns empty string.
height(<player>)  Terminal height in lines. Returns 24.
width(<player>)   Terminal width in columns. Returns 80.
colordepth()      Color capability. Returns 16.

rxlevel(<player>)      Receive level (TinyMUX comms). Returns 0.
txlevel(<player>)      Transmit level. Returns 0.
hasrxlevel(<p>,<lev>)  Has receive level. Returns 0.
hastxlevel(<p>,<lev>)  Has transmit level. Returns 0.
listrlevels()          List all levels. Returns empty.
bittype()              Bit width type. Returns 0.

-------------------------------------------------------------------------------
SQL (DISABLED)
-------------------------------------------------------------------------------

sql(<query>)
  Returns #-1 FUNCTION DISABLED.
  SQL access is not available in UrsaMU softcode.

-------------------------------------------------------------------------------
CHANNEL / COMMS STUBS
-------------------------------------------------------------------------------

zwho()           Zone who list. Returns empty.
comalias(<p>)    Com alias for player. Returns empty.
comtitle(<p>)    Com title for player. Returns empty.
lcmds(<obj>)     $-command list. Returns empty.
