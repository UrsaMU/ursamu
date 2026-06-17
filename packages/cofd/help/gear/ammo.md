+gear ammo  -- Magazines and ammunition stacks.

Ammo items are first-class CoFD objects. They live in the carrier's
inventory, stack by catalog key, and can be split, damaged, and handed off
through the native give command.

Stacking:
  When you /add an ammo key and you already carry a stack of the same key,
  the new ammo merges into your existing stack ($inc count). When you fully
  consume a stack via /reload, the stack object is destroyed.

  Note: stacking is automatic on /add today. Picking up an ammo item from
  the floor with native get does not currently merge -- the engine does not
  yet expose a "thing moved" hook. After native get, you may have two
  separate stacks of the same key; that is harmless.

Splitting:
  +gear/split <slot>=<n> peels <n> rounds off the stack at <slot> and
  produces a new stack of size <n>, leaving the original at count-n.
  Invariants: 1 <= n < count. Splitting a stack of 1 errors.

Concealment:
  Magazines flagged dark show "[concealed]" in +gear. Frisking an NPC for
  spare mags works the same as searching any other carried object.

Examples:
  +gear/add magazine-9mm-light     First mag, stack of 1.
  +gear/add magazine-9mm-light     Stacks to 2.
  +gear/split 3=1                  Split one round off into its own stack.
  give 4=Marcus                    Native give: hand the new stack off.

See also: gear, gear durability, gear reload
