+ARCHIVE

The **+archive** command views and purges closed/archived jobs (staff only).

SYNTAX
  +archive
  +archive <#>
  +archive/purge <#>
  +archive/purgeall CONFIRM

SWITCHES
  /purge      Permanently delete an archived job. (superuser)
  /purgeall   Delete all archived jobs. (superuser)

EXAMPLES
  +archive
  +archive 12
  +archive/purge 12

SEE ALSO: +help jobs, +help job
