+JOB

The **+job** command manages player requests and staff tasks (staff only).

SYNTAX
  +jobs [<bucket>]
  +job <#>
  +job/comment <#>=<text>
  +job/assign <#>=<staff>
  +job/close <#>[=<comment>]
  +job/addplayer <player> to <#>
  +job/addaccess <bucket>=<staff>
  +job/removeaccess <bucket>=<staff>
  +job/listaccess
  +job/renumber

EXAMPLES
  +jobs
  +jobs PLOT
  +job 5
  +job/assign 5=Bob
  +job/close 5=Resolved.

SEE ALSO: +help jobs, +help archive
