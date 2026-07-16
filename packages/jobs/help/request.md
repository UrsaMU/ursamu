+REQUEST

The **+request** command allows players to submit and manage requests (jobs).

SYNTAX
  +request <title>=<text>
  +request/create <bucket>/<title>=<text>
  +request/comment <#>=<text>
  +request/cancel <#>
  +request/addplayer <#>=<player>

SWITCHES
  /create      Submit to a specific category bucket.
  /comment     Add an update comment to your request.
  /cancel      Cancel your submitted request.
  /addplayer   Allow another player to view this request.

EXAMPLES
  +request typo=Typo in room 3.
  +request/create PLOT/Bug=I got stuck.
  +request 12
  +request/comment 12=Never mind, it works.

SEE ALSO: +help jobs
