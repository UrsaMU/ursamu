/**
 * Format a timestamp (ms since epoch) as a colored idle-time string.
 * Colors shift from green → yellow → red as idle time grows.
 */
export const idle = (secs: number): string => {
  const snds = secs ? Math.round((Date.now() - secs) / 1000) : 0;
  let time: string;

  if      (snds < 60)       time = `${snds}s`;
  else if (snds < 3600)     time = `${Math.floor(snds / 60)}m`;
  else if (snds < 86400)    time = `${Math.floor(snds / 3600)}h`;
  else if (snds < 604800)   time = `${Math.floor(snds / 86400)}d`;
  else if (snds < 2419200)  time = `${Math.floor(snds / 604800)}w`;
  else if (snds < 29030400) time = `${Math.floor(snds / 2592000)}mo`;
  else                      time = `${Math.floor(snds / 31536000)}y`;

  const IDLE_GREEN  = 600;
  const IDLE_YELLOW = 1500;
  const IDLE_RED    = 3600;

  if (snds < IDLE_GREEN)  return `%ch%cg${time}%cn`;
  if (snds < IDLE_YELLOW) return `%ch%cy${time}%cn`;
  if (snds < IDLE_RED)    return `%ch%cr${time}%cn`;
  return `%ch%cx${time}%cn`;
};
