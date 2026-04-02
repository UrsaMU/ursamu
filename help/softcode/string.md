SOFTCODE STRING FUNCTIONS

See also: softcode/index, softcode/list, softcode/math

-------------------------------------------------------------------------------
CONCATENATION / LENGTH
-------------------------------------------------------------------------------

cat(<str1>,<str2>[,...])
  Joins strings with a single space between each.
  > [cat(hello,world)] → hello world

strcat(<str1>,<str2>[,...])
  Joins strings with no separator.
  > [strcat(foo,bar)] → foobar

strlen(<str>)
  Character length of str (ANSI codes not counted).
  > [strlen(hello)] → 5

strmem(<str>)
  Byte size of str (UTF-8 encoded).

-------------------------------------------------------------------------------
CASE CONVERSION
-------------------------------------------------------------------------------

upcase(<str>)  / ucstr(<str>)    Convert to UPPERCASE.
lowcase(<str>) / lcstr(<str>)    Convert to lowercase.
capstr(<str>)                    Capitalise first letter only.

  > [upcase(hello)] → HELLO
  > [capstr(hello world)] → Hello world

-------------------------------------------------------------------------------
PADDING / ALIGNMENT
-------------------------------------------------------------------------------

ljust(<str>,<width>[,<fill>])
  Left-justify str in a field of <width> chars, padded with <fill> (default space).
  > [ljust(hi,6,-)] → hi----

rjust(<str>,<width>[,<fill>])
  Right-justify str.
  > [rjust(hi,6,-)] → ----hi

center(<str>,<width>[,<fill>])
  Centre str.
  > [center(hi,6,-)] → --hi--

lpad(<str>,<width>[,<fill>])    Alias for ljust.
rpad(<str>,<width>[,<fill>])    Alias for rjust.
cpad(<str>,<width>[,<fill>])    Alias for center.

space(<n>)
  Returns a string of <n> spaces.
  > [space(3)] → "   "

-------------------------------------------------------------------------------
EXTRACTION
-------------------------------------------------------------------------------

left(<str>,<n>)
  First <n> characters of str.
  > [left(hello,3)] → hel

right(<str>,<n>)
  Last <n> characters of str.
  > [right(hello,3)] → llo

mid(<str>,<start>,<len>)
  <len> characters starting at position <start> (1-based).
  > [mid(hello,2,3)] → ell

strtrunc(<str>,<n>)
  Truncate str to at most <n> characters.

before(<str>,<needle>)
  Returns the part of str before the first occurrence of <needle>.
  > [before(foo:bar,:)] → foo

after(<str>,<needle>)
  Returns the part of str after the first occurrence of <needle>.
  > [after(foo:bar,:)] → bar

-------------------------------------------------------------------------------
SEARCHING
-------------------------------------------------------------------------------

pos(<needle>,<haystack>)
  Position (1-based) of first occurrence of needle in haystack. 0 if not found.
  > [pos(ll,hello)] → 3

lpos(<str>,<char>)
  Space-separated list of all positions where <char> appears.
  > [lpos(hello,l)] → 3 4

index(<str>,<delim>,<n>)
  Returns the <n>th delimited field.
  > [index(a:b:c,:,2)] → b

wordpos(<str>,<word>[,<delim>])
  Position (1-based) of <word> in the space-delimited list.
  > [wordpos(a b c,b)] → 2

-------------------------------------------------------------------------------
EDITING
-------------------------------------------------------------------------------

edit(<str>,<old>,<new>)
  Replace all occurrences of <old> with <new> in str.
  > [edit(hello world,o,0)] → hell0 w0rld

trim(<str>[,<where>[,<chars>]])
  Strip leading/trailing whitespace (or custom chars).
  <where>: l=left only, r=right only, b=both (default).
  > [trim(  hello  )] → hello

squish(<str>)
  Collapse all internal whitespace to single spaces and trim ends.
  > [squish(  a   b   c  )] → a b c

reverse(<str>)
  Reverse the characters of str.
  > [reverse(hello)] → olleh

repeat(<str>,<n>)
  Repeat str exactly <n> times.
  > [repeat(ab,3)] → ababab

-------------------------------------------------------------------------------
MATCHING
-------------------------------------------------------------------------------

strmatch(<str>,<pattern>)
  Returns 1 if str matches the glob pattern (* = any, ? = one char). Case-insensitive.
  > [strmatch(hello,h*o)] → 1

comp(<str1>,<str2>)
  Lexicographic comparison: -1, 0, or 1.
  > [comp(apple,banana)] → -1

regmatch(<str>,<pattern>)
  Returns 1 if str matches the regex pattern.
  > [regmatch(hello,^h)] → 1

regmatchi(<str>,<pattern>)
  Case-insensitive regex match.

regrab(<str>,<pattern>[,<n>])
  Returns capture group <n> (default 0 = whole match) from first regex match.
  > [regrab(score: 42,\d+)] → 42

regrabi(<str>,<pattern>[,<n>])
  Case-insensitive regrab.

regraball(<str>,<pattern>[,<n>[,<delim>]])
  All matches of capture group <n>, joined by <delim> (default space).
  > [regraball(1a2b3c,\d)] → 1 2 3

regraballi(<str>,<pattern>[,<n>[,<delim>]])
  Case-insensitive regraball.

grep(<str>,<pattern>)
  Returns the words in str that match the glob pattern.
  > [grep(foo bar baz,b*)] → bar baz

grepi(<str>,<pattern>)
  Case-insensitive grep.

-------------------------------------------------------------------------------
ARTICLE
-------------------------------------------------------------------------------

art(<word>)
  Returns "an" if word starts with a vowel sound, otherwise "a".
  > [art(apple)] → an   [art(banana)] → a   [art(hour)] → an

-------------------------------------------------------------------------------
SPEECH FORMATTER
-------------------------------------------------------------------------------

speak(<name>,<string>[,<type>])
  Formats speech or pose output.

  type 0 / "say" (default): Name says "string."
  type 1 / "pose" / ":":    Name string
  type 2 / "semipose" / ";": Namestring  (no space)
  type 3 / "emit":           string  (no name prefix)

  > [speak(Alice,Hello!)] → Alice says "Hello!"
  > [speak(Alice,waves.,pose)] → Alice waves.

-------------------------------------------------------------------------------
WRAPPING / COLUMNS
-------------------------------------------------------------------------------

wrap(<str>,<width>[,<indent>[,<hang>]])
  Word-wrap str at <width> columns. <indent> = spaces before each line.
  <hang> = hanging-indent for lines after the first.
  > [wrap(This is a long sentence,20)] → wraps at 20 chars

columns(<str>,<width>[,<n>[,<delim>]])
  Format str as <n>-column output, each column <width> chars wide.

table(<list>,<width>[,<cols>[,<sep>[,<delim>]]])
  Lay out a list in a table format of <width> total width.
  > [table(a b c d e f,20,3)] → a b c / d e f (3 columns)

-------------------------------------------------------------------------------
SOUNDEX / SPELLING
-------------------------------------------------------------------------------

soundex(<str>)
  Returns the Soundex code for str. > [soundex(Robert)] → R163

soundslike(<str1>,<str2>)
  Returns 1 if both strings have the same Soundex code.
  > [soundslike(Robert,Rupert)] → 1

spellnum(<n>)
  Converts an integer to English words.
  > [spellnum(42)] → forty-two

itemize(<list>[,<delim>[,<conj>[,<odelim>]]])
  Formats a list as natural English: "a, b, and c".
  > [itemize(a b c)] → a, b, and c
  > [itemize(a b c,, ,or)] → a, b, or c

-------------------------------------------------------------------------------
CHARACTER CODES
-------------------------------------------------------------------------------

chr(<n>)
  Returns the character with Unicode codepoint <n>.
  > [chr(65)] → A

ord(<char>)
  Returns the Unicode codepoint of the first character of <char>.
  > [ord(A)] → 65

-------------------------------------------------------------------------------
SECURITY / ENCODING
-------------------------------------------------------------------------------

escape(<str>)
  Escapes all % characters to %%.
  > [escape(100%)] → 100%%

secure(<str>)
  Replaces special softcode characters (;,[,],etc.) with spaces.
  Prevents injection when echoing untrusted user input.

encrypt(<str>,<key>)
  Returns str encrypted with key. (Stub — returns str unchanged.)

decrypt(<str>,<key>)
  Returns str decrypted with key. (Stub — returns str unchanged.)

strip(<str>) / stripansi(<str>)
  Remove all ANSI escape codes from str.

stripaccents(<str>)
  Remove diacritical marks (é→e, ü→u, etc.).

accent(<str>)
  Apply MUSH accent codes. (Passthrough in this version.)

translate(<str>[,<type>])
  Convert ANSI codes to a different format. (Simplified in this version.)

-------------------------------------------------------------------------------
HASHING
-------------------------------------------------------------------------------

sha1(<str>)
  Returns the SHA-1 hex digest of str.
  > [sha1(hello)] → aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d

digest(<str>[,<algo>])
  Returns a hex digest. Supported algorithms: sha-1, sha-256, sha-512.
  > [digest(hello,sha-256)] → 2cf24dba...

crc32(<str>)
  Returns 0. (Stub — CRC32 not implemented.)

-------------------------------------------------------------------------------
ANSI / COLOR
-------------------------------------------------------------------------------

ansi(<codes>,<str>)
  Applies ANSI formatting codes to str, automatically resetting at end.
  <codes> is a space-separated list of: r(ed), g(reen), y(ellow), b(lue),
  m(agenta), c(yan), w(hite), n(ormal/reset), h(ighlight/bold),
  u(nderline), i(talic), f(lash/blink),
  R/G/Y/B/M/C/W = background colours.
  > [ansi(h r,DANGER)] → bold red "DANGER" with reset

beep()
  Returns an empty string. (No-op in WebSocket context.)

isalnum(<str>)  1 if str contains only letters and digits.
ispunct(<str>)  1 if str contains only punctuation characters.
alpha(<str>)    1 if str contains only letters.
alphamax(<str1>,<str2>[,...])  Alphabetically largest of the arguments.
alphamin(<str1>,<str2>[,...])  Alphabetically smallest of the arguments.

-------------------------------------------------------------------------------
PACK / UNPACK
-------------------------------------------------------------------------------

pack(<str1>[,<str2>...])
  Joins arguments with spaces (alias for cat).

unpack(<str>)
  Returns str unchanged. (Stub.)

-------------------------------------------------------------------------------
STRMATCH WILDCARDS

  *   matches any sequence of characters (including empty)
  ?   matches exactly one character
  Patterns are case-insensitive.

  > [strmatch(Hello World,*world)] → 1
  > [strmatch(abc,a?c)] → 1
