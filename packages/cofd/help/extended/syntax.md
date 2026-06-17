extended/syntax  -- /start expression and switch details.

See also: help extended (overview).

START EXPRESSION
  +extended/start <pool>=<target>[/<n>][/<int>][/cum] <desc>
    <pool>    Dice pool, e.g. intelligence+occult.
    <target>  Successes needed.
    <n>       Max attempts.   <int> turn|hour|day|scene.
    /cum      Cumulative -1 per attempt.

ROLL STACKING: /wp /rote /9again /8again /job=N can stack on /roll.

PERMISSIONS
  /start /roll /abandon  owner.
  /finish /list all /contest  staff.

EXAMPLES
  +extended/start intelligence+occult=10 Decipher the grimoire
  +extended/roll/wp/job=1024 -1

SEE ALSO: help extended/pool, help extended/cumulative
