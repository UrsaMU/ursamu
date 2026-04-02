SOFTCODE TIME FUNCTIONS

See also: softcode/index, softcode/server, softcode/math

-------------------------------------------------------------------------------
TIMESTAMPS
-------------------------------------------------------------------------------

secs()
  Returns the current Unix timestamp in seconds (integer).
  > [secs()] → 1743570000

msecs()
  Returns the current Unix timestamp in milliseconds.
  > [msecs()] → 1743570000123

time()
  Returns the current date/time as a human-readable UTC string.
  > [time()] → Wed, 02 Apr 2026 12:00:00 GMT

ctime()
  Alias for time().

mtime()
  Alias for time().

startsecs()
  Unix timestamp (seconds) when this server process started.
  > [startsecs()] → 1743569000

starttime()
  Human-readable start time.
  > [starttime()] → Wed, 02 Apr 2026 11:50:00 GMT

restartsecs()
  Unix timestamp of the last restart. Equal to startsecs() in this version.

restarttime()
  Human-readable last restart time.

restarts()
  Number of times the server has restarted. Returns 0 in this version.

writetime()
  Unix timestamp of the last database write (returns current time in this version).

exptime()
  Seconds until the next database expiration cycle. Returns 0.

-------------------------------------------------------------------------------
FORMATTING
-------------------------------------------------------------------------------

timefmt(<format>,<secs>)
  Formats Unix timestamp <secs> as a string using strftime-style codes.
  If <secs> is omitted, uses the current time.

  Format codes:
    %a  Abbreviated weekday (Mon, Tue, ...)
    %A  Full weekday (Monday, Tuesday, ...)
    %b  Abbreviated month (Jan, Feb, ...)
    %B  Full month (January, February, ...)
    %c  Locale date and time
    %d  Day of month, zero-padded (01–31)
    %e  Day of month, space-padded ( 1–31)
    %H  Hour, 24-hour clock (00–23)
    %I  Hour, 12-hour clock (01–12)
    %j  Day of year (001–366)
    %m  Month (01–12)
    %M  Minute (00–59)
    %p  AM or PM
    %P  am or pm
    %S  Second (00–59)
    %T  Time as HH:MM:SS
    %u  Weekday (1=Monday, 7=Sunday)
    %w  Weekday (0=Sunday, 6=Saturday)
    %x  Locale date
    %X  Locale time
    %y  Year, 2-digit (00–99)
    %Y  Year, 4-digit
    %z  UTC offset (+0000)
    %Z  Timezone name
    %%  Literal %

  > [timefmt(%A %B %d %Y,[secs()])] → Wednesday April 02 2026
  > [timefmt(%H:%M:%S,[secs()])] → 12:00:00

  NOTE: Inside softcode, % is a substitution prefix. Use %% in attribute
  values to produce a literal %. Example:
    &TIME_FMT me=[timefmt(%%H:%%M:%%S,[secs()])]

convsecs(<secs>)
  Returns <secs> unchanged (numeric passthrough for TinyMUX compatibility).

convtime(<time_str>)
  Parses a time string and returns a Unix timestamp in seconds.
  > [convtime(Wed, 02 Apr 2026 12:00:00 GMT)] → 1743595200

-------------------------------------------------------------------------------
ELAPSED TIME FORMATTING
-------------------------------------------------------------------------------

etimefmt(<format>,<secs>)
  Formats an elapsed duration (not a timestamp).

  Format codes:
    %H  Hours (total, may exceed 24)
    %M  Minutes (00–59)
    %S  Seconds (00–59)

  NOTE: Inside attribute values, use %% for literal %:
    &UPTIME me=[etimefmt(%%H:%%M:%%S,[sub([secs()],[startsecs()])])]

  > [etimefmt(%H:%M:%S,3723)] → 01:02:03
  > [etimefmt(%H hours,7200)] → 02 hours

digittime(<secs>)
  Formats elapsed seconds as D:HH:MM:SS.
  Days are omitted if zero.
  > [digittime(3723)] → 1:02:03
  > [digittime(90061)] → 1:01:01:01

singletime(<secs>)
  Formats elapsed seconds in the largest natural unit with a suffix:
  s (seconds), m (minutes), h (hours), d (days), w (weeks), M (months),
  y (years).
  > [singletime(3600)] → 1h
  > [singletime(90)] → 1m
  > [singletime(172800)] → 2d

-------------------------------------------------------------------------------
COMMON PATTERNS
-------------------------------------------------------------------------------

Session uptime:
  [singletime([sub([secs()],[startsecs()])])] uptime

Display idle time:
  Idle [digittime([idle(#1)])]

Formatted timestamp:
  [timefmt(%%a %%b %%d %%Y,[secs()])]

Countdown:
  [singletime([sub(<target_secs>,[secs()])])] remaining
