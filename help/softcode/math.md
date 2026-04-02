SOFTCODE MATH FUNCTIONS

See also: softcode/index, softcode/string, softcode/list

-------------------------------------------------------------------------------
ARITHMETIC
-------------------------------------------------------------------------------

add(<n1>,<n2>[,...])
  Returns the sum of all arguments.
  > [add(2,3,4)] → 9

sub(<n1>,<n2>)
  Returns n1 minus n2.
  > [sub(10,3)] → 7

mul(<n1>,<n2>[,...])
  Returns the product of all arguments.
  > [mul(2,3,4)] → 24

div(<n1>,<n2>)
  Returns n1 divided by n2. Returns #-1 DIVISION BY ZERO if n2 is 0.
  > [div(10,4)] → 2.5

fdiv(<n1>,<n2>)
  Alias for div(). Floating-point division.

floordiv(<n1>,<n2>)
  Integer (floor) division: floor(n1/n2).
  > [floordiv(10,3)] → 3

mod(<n1>,<n2>)
  Remainder after integer division (n1 mod n2).
  > [mod(10,3)] → 1

fmod(<n1>,<n2>)
  Floating-point remainder. fmod(10.5,3) → 1.5

remainder(<n1>,<n2>)
  IEEE 754 remainder (may differ from mod for negatives).

abs(<n>)
  Absolute value. > [abs(-5)] → 5

iabs(<n>)
  Integer absolute value (truncates first).

inc(<n>)
  Returns n + 1. > [inc(4)] → 5

dec(<n>)
  Returns n - 1. > [dec(4)] → 3

imul(<n1>,<n2>)
  Integer multiplication (truncates to integer).

idiv(<n1>,<n2>)
  Integer division (truncates toward zero).

sign(<n>)
  Returns -1, 0, or 1 depending on the sign of n.
  > [sign(-5)] → -1   [sign(0)] → 0   [sign(3)] → 1

isign(<n>)
  Same as sign() but truncates n to integer first.

max(<n1>,<n2>[,...])
  Returns the largest of all arguments.
  > [max(3,7,2,9)] → 9

min(<n1>,<n2>[,...])
  Returns the smallest of all arguments.
  > [min(3,7,2,9)] → 2

rand(<n>)
  Returns a random integer from 0 to n-1.
  > [rand(6)] → 0..5

-------------------------------------------------------------------------------
ROUNDING
-------------------------------------------------------------------------------

round(<n>[,<places>])
  Rounds n to <places> decimal places (default 0).
  > [round(3.567,2)] → 3.57

ceil(<n>)
  Returns the smallest integer >= n. > [ceil(3.2)] → 4

floor(<n>)
  Returns the largest integer <= n. > [floor(3.8)] → 3

trunc(<n>)
  Truncates toward zero (removes fractional part).
  > [trunc(3.9)] → 3   [trunc(-3.9)] → -3

-------------------------------------------------------------------------------
POWER / LOGARITHM
-------------------------------------------------------------------------------

sqrt(<n>)
  Square root. > [sqrt(9)] → 3

power(<base>,<exp>)
  base raised to the power exp. > [power(2,8)] → 256

exp(<n>)
  e raised to the power n. > [exp(1)] → 2.718...

ln(<n>)
  Natural logarithm (base e). > [ln(1)] → 0

log(<n>[,<base>])
  Logarithm. Default base 10. [log(100)] → 2, [log(8,2)] → 3

e()
  Returns Euler's number (2.71828...).

pi()
  Returns π (3.14159...).

-------------------------------------------------------------------------------
TRIGONOMETRY  (all in radians)
-------------------------------------------------------------------------------

sin(<n>)    Sine.
cos(<n>)    Cosine.
tan(<n>)    Tangent.
asin(<n>)   Arc sine.
acos(<n>)   Arc cosine.
atan(<n>)   Arc tangent.
atan2(<y>,<x>)  Four-quadrant arc tangent.

  > [round([mul(2,[pi()])],4)] → 6.2832

-------------------------------------------------------------------------------
COMPARISON  (return 1 for true, 0 for false)
-------------------------------------------------------------------------------

eq(<n1>,<n2>)   n1 == n2 (numeric)
neq(<n1>,<n2>)  n1 != n2
lt(<n1>,<n2>)   n1 <  n2
lte(<n1>,<n2>)  n1 <= n2
gt(<n1>,<n2>)   n1 >  n2
gte(<n1>,<n2>)  n1 >= n2

comp(<str1>,<str2>)
  String comparison. Returns -1, 0, or 1 (lexicographic order).
  > [comp(apple,banana)] → -1

ncomp(<n1>,<n2>)
  Numeric comparison. Returns -1, 0, or 1.
  > [ncomp(10,5)] → 1

-------------------------------------------------------------------------------
BITWISE
-------------------------------------------------------------------------------

band(<n1>,<n2>)   Bitwise AND.
bor(<n1>,<n2>)    Bitwise OR.
bxor(<n1>,<n2>)   Bitwise XOR.
bnand(<n1>,<n2>)  Bitwise NOT AND (complement of AND).
shl(<n>,<bits>)   Left shift n by bits positions.
shr(<n>,<bits>)   Right shift n by bits positions.

  > [band(12,10)] → 8   [bor(12,10)] → 14   [shl(1,3)] → 8

baseconv(<num>,<from>,<to>)
  Convert <num> in base <from> to base <to>. Bases 2–36.
  > [baseconv(255,10,16)] → FF
  > [baseconv(FF,16,10)] → 255

bittype()
  Returns 0. (TinyMUX compatibility stub.)

-------------------------------------------------------------------------------
DISTANCE / VECTOR
-------------------------------------------------------------------------------

dist2d(<x1>,<y1>,<x2>,<y2>)
  Euclidean distance between two 2D points.
  > [dist2d(0,0,3,4)] → 5

dist3d(<x1>,<y1>,<z1>,<x2>,<y2>,<z2>)
  Euclidean distance between two 3D points.

vadd(<v1>,<v2>)     Add two space-separated vectors.
vsub(<v1>,<v2>)     Subtract vectors.
vmul(<v>,<scalar>)  Multiply vector by scalar.
vmag(<v>)           Magnitude (length) of vector.
vunit(<v>)          Normalise vector to unit length.
vdot(<v1>,<v2>)     Dot product.
vcross(<v1>,<v2>)   Cross product (3D).
vdim(<v>)           Number of dimensions in vector.

  > [vadd(1 2 3,4 5 6)] → 5 7 9
  > [vmag(3 4)] → 5

-------------------------------------------------------------------------------
ROMAN NUMERALS
-------------------------------------------------------------------------------

roman(<n>)
  Converts integer 1–3999 to Roman numerals.
  > [roman(2024)] → MMXXIV

-------------------------------------------------------------------------------
TYPE CHECKS
-------------------------------------------------------------------------------

isnum(<str>)    1 if str is a valid number.
isint(<str>)    1 if str is a valid integer.
israt(<str>)    1 if str is a valid rational (decimal) number.
isinf(<str>)    1 if str represents infinity.
isword(<str>)   1 if str contains no whitespace.

  > [isnum(3.14)] → 1   [isint(3.14)] → 0   [isword(hello)] → 1

-------------------------------------------------------------------------------
GAME DICE (World of Darkness style)
-------------------------------------------------------------------------------

successes(<num_dice>,<difficulty>)
  Rolls <num_dice> d10s. Returns the net number that meet or exceed
  <difficulty> (default 6), minus the number of 1s rolled (botches).
  Negative result = botch.
  > [successes(5,6)] → 2   (example result — actual result varies)

distribute(<total>,<slots>[,<delim>])
  Distributes <total> items across <slots> as evenly as possible.
  Returns a delimited list; leading slots get the extra when uneven.
  > [distribute(10,3)] → 4 3 3
  > [distribute(9,4)] → 3 3 3 0
