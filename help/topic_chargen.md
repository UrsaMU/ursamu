---
category: Character Creation
---

# Character Generation Commands

Welcome to the character generation system, help. This file acts as both a guide
and a help file, for making your character. The commands are listed below, and
the order in which you should use them is also listed. If you have any
questions, please contact a staff member.

## Commands

-`+template <template>`: Sets your template. This is the first command you
should use. You can only use this command once. To set your template again you
will have to `+stats/reset`.

- `+stat [<player>/]<stat>=<value>`: Sets a stat to a value. If no player is
  specified, it will set the stat for you. If you are a staff member, you can
  set the stat for another player. To remove a stat, leave it's value blank.
  `+stat brawl=` will remove brawl, and all brawl specialties.

- -`+stat [<player>/]<stat>=<value>/<specialty>`: Sets a stat to a value and a
  specialty. If no player is specified, it will set the stat for you. If you are
  a staff member, you can set the stat for another player. To remove a
  specialty, set it's value to zero. `+stat brawl=0/boxing` will remove the
  boxing specialty from brawl.

- `+stat/temp [<player>/]<stat>=<value>`: Sets a stat to a value, but only
  temporarily. If no player is specified, it will set the stat for you. If you
  are a staff member, you can set the stat for another player.

- `+stat/reset`: Resets your stats to their default values. This will also reset
  your template, and your specialties.

## Order

### 1. Set your template

Use the `+template` command to set your template. You can only use this command
once. To set your template again you will have to `+stats/reset`.

### 2. Set your stats

Use the `+stat` command to set your stats. You can set your stats in any order
you want, but you must set them all before moving on to the next step.

### 3. Set your specialties

Use the `+stat <stat>=<value>/<specialty>` command to set your skill
specialties, but also to set powers for disciplines following the same format.
`+stat <discipline>=<level>/<power>` will set your power for that discipline. To
remove a specialty or power set its value to zero.
