SOFTCODE LIST FUNCTIONS

Lists are space-separated strings by default. Most functions accept an
optional delimiter argument to use a different separator.

  words:      "apple banana cherry"
  custom:     "apple,banana,cherry"  (delim = ,)
  null delim: each character is an element (delim = @@)

See also: softcode/index, softcode/string, softcode/registers

-------------------------------------------------------------------------------
SIZE / ACCESS
-------------------------------------------------------------------------------

words(<list>[,<delim>]) / numwords(<list>[,...]) / nwords(<list>[,...])
  Returns the number of words in list.
  > [words(a b c)] → 3   [words(a,b,c,,)] → 3

word(<list>,<n>[,<delim>])
  Returns the <n>th word (1-based).
  > [word(a b c,2)] → b

first(<list>[,<delim>])
  Returns the first word.
  > [first(a b c)] → a

rest(<list>[,<delim>])
  Returns all words after the first.
  > [rest(a b c)] → b c

last(<list>[,<delim>])
  Returns the last word.
  > [last(a b c)] → c

extract(<list>,<first>[,<len>[,<delim>]])
  Returns <len> words starting at position <first>.
  > [extract(a b c d,2,2)] → b c

elements(<list>,<positions>[,<delim>[,<pdelim>]])
  Returns the words at the given positions (space-sep list of indices).
  > [elements(a b c d,1 3)] → a c

-------------------------------------------------------------------------------
SEARCHING
-------------------------------------------------------------------------------

member(<list>,<item>[,<delim>])
  Returns the position (1-based) of item in list, or 0 if not found.
  > [member(a b c,b)] → 2

match(<list>,<pattern>[,<delim>])
  Returns the position of the first word matching glob pattern, or 0.
  > [match(foo bar baz,b*)] → 2

matchall(<list>,<pattern>[,<delim>[,<odelim>]])
  Returns all words matching glob pattern.
  > [matchall(foo bar baz,b*)] → bar baz

grab(<list>,<pattern>[,<delim>])
  Returns the first word matching glob pattern, or empty string.
  > [grab(foo bar baz,b*)] → bar

graball(<list>,<pattern>[,<delim>[,<odelim>]])
  Returns all matching words (alias for matchall with different args).

-------------------------------------------------------------------------------
MODIFICATION
-------------------------------------------------------------------------------

insert(<list>,<pos>,<item>[,<delim>])
  Inserts <item> before position <pos>.
  > [insert(a b c,2,X)] → a X b c

replace(<list>,<pos>,<item>[,<delim>])
  Replaces the word at position <pos> with <item>.
  > [replace(a b c,2,X)] → a X c

remove(<list>,<item>[,<delim>])
  Removes all occurrences of <item> from list.
  > [remove(a b a c,a)] → b c

delete(<list>,<pos>[,<delim>])
  Deletes the word at position <pos>.
  > [delete(a b c,2)] → a c

ldelete(<list>,<pos>[,<n>[,<delim>]])
  Deletes <n> words starting at position <pos>.

splice(<list1>,<list2>[,<delim>])
  Interleaves two lists word-by-word.
  > [splice(a b c,1 2 3)] → a 1 b 2 c 3

revwords(<list>[,<delim>])
  Reverses the order of words.
  > [revwords(a b c)] → c b a

shuffle(<list>[,<delim>])
  Returns the list in random order.

-------------------------------------------------------------------------------
SORTING
-------------------------------------------------------------------------------

sort(<list>[,<type>[,<delim>[,<odelim>]]])
  Sorts list. <type>: a=alphabetic (default), n=numeric, i=case-insensitive,
  d=dbref, f=float.
  > [sort(banana apple cherry)] → apple banana cherry
  > [sort(3 1 2,n)] → 1 2 3

sortby(<attr>,<list>[,<delim>])
  Sorts list using a user-defined comparator attribute.
  The attribute receives %0 and %1, returns -1/0/1.

-------------------------------------------------------------------------------
SET OPERATIONS
-------------------------------------------------------------------------------

setunion(<list1>,<list2>[,<delim>[,<osep>]])
  Returns all unique elements in either list.
  > [setunion(a b c,b c d)] → a b c d

setinter(<list1>,<list2>[,<delim>[,<osep>]])
  Returns elements present in both lists.
  > [setinter(a b c,b c d)] → b c

setdiff(<list1>,<list2>[,<delim>[,<osep>]])
  Returns elements in list1 that are not in list2.
  > [setdiff(a b c,b c d)] → a

merge(<list1>,<list2>[,<delim>])
  Merge two sorted lists preserving sort order (removes duplicates).

-------------------------------------------------------------------------------
NUMERIC LIST OPERATIONS
-------------------------------------------------------------------------------

ladd(<list>[,<delim>])
  Returns the sum of all numbers in list.
  > [ladd(1 2 3 4)] → 10

lmin(<list>[,<delim>])
  Returns the minimum value.
  > [lmin(3 1 4 1 5)] → 1

lmax(<list>[,<delim>])
  Returns the maximum value.
  > [lmax(3 1 4 1 5)] → 5

land(<list>[,<delim>])
  Returns 1 if all elements are true (non-zero, non-empty).

lor(<list>[,<delim>])
  Returns 1 if any element is true.

lnum(<start>[,<end>[,<step>[,<delim>]]])
  Generates a numeric sequence.
  > [lnum(1,5)] → 1 2 3 4 5
  > [lnum(0,10,2)] → 0 2 4 6 8 10

lrand(<n>[,<delim>])
  Returns a shuffled list of integers 0 to n-1.

-------------------------------------------------------------------------------
RANDOM SELECTION
-------------------------------------------------------------------------------

pickrand(<list>[,<delim>])
  Returns a single randomly chosen word.
  > [pickrand(a b c d)] → b  (random)

choose(<list>[,<weights>[,<delim>]])
  Weighted random selection. <weights> is a matching list of weights.
  > [choose(a b c,1 2 3)] → c  (c is 3× more likely than a)

-------------------------------------------------------------------------------
ITERATION / MAPPING
-------------------------------------------------------------------------------

iter(<list>,<expr>[,<idelim>[,<odelim>]])
  Evaluates <expr> for each item. Within expr, ## = current item,
  #@ = current position (1-based), %i0–%i9 = nested iter items.
  > [iter(a b c,[upcase(##)])] → A B C
  > [iter(1 2 3,[mul(##,2)])] → 2 4 6
  > [iter(a b c,#@:##, ,|)] → 1:a|2:b|3:c

parse(<list>,<expr>[,<idelim>[,<odelim>]])
  Alias for iter(). TinyMUX compatibility name.

map(<attr>,<list>[,<delim>[,<odelim>]])
  Calls an attribute for each element, passing ## as %0.
  NOTE: attr argument requires the raw attribute spec (known limitation);
  use [iter(list,[u(obj/ATTR,##)])] as a reliable alternative.

filter(<attr>,<list>[,<delim>[,<odelim>]])
  Returns elements for which attr returns a true value.
  See map() note above.

filterbool(<attr>,<list>[,<delim>[,<odelim>]])
  Like filter() but returns 1/0 flags instead of filtered items.

fold(<attr>,<list>[,<base>[,<delim>]])
  Folds list using attr as accumulator function.
  Attr receives: %0 = accumulator, %1 = current item.

foreach(<attr>,<str>)
  Calls attr once per CHARACTER in str, passing ## as the char.

munge(<attr>,<list1>[,<list2>[,<delim>]])
  Sorts list1 according to attr's evaluation of each element.

step(<attr>,<list>[,<n>[,<delim>]])
  Calls attr on groups of <n> consecutive items.
  > With n=2: attr called with %0=item1, %1=item2 for each pair.

mix(<attr>,<list1>,<list2>[,<delim>])
  Calls attr with corresponding elements from list1 and list2.
  > [iter(result of mix(PLUS,1 2 3,4 5 6))] → 5 7 9

-------------------------------------------------------------------------------
DISTRIBUTION / TABLE
-------------------------------------------------------------------------------

distribute(<total>,<slots>[,<delim>])
  See softcode/math for full description.

table(<list>,<width>[,<cols>[,<sep>[,<delim>]]])
  Format list as a multi-column table.
  > [table(a b c d e f,20,3)] → a    b    c
                                 d    e    f
