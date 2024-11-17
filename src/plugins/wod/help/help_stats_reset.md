+STATS/RESET

Syntax: +stats/reset [<target>]
        +stats/reset/confirm <target>

Reset a character's stats and damage. 

Requires admin privileges. 
- Without a target, defaults to yourself
- Must first use +stats/reset to initiate
- Confirm reset with +stats/reset/confirm

Examples:
  +stats/reset       - Prepare to reset your own stats
  +stats/reset Bob   - Prepare to reset Bob's stats
  +stats/reset/confirm Bob  - Confirm reset of Bob's stats

WARNING: This completely removes all stats and 
         resets damage to zero. Use with caution!
