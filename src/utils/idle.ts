import { dbojs } from '../services/Database/index.ts';

export const idle = (secs: number) => {
  const snds = secs ? Math.round((Date.now() - secs) / 1000) : 0;

  let time;
  switch (true) {
    case snds < 60:
      time = `${snds}s`;
      break;
    case snds < 3600:
      time = `${Math.floor(snds / 60)}m`;
      break;
    case snds < 86400:
      time = `${Math.floor(snds / 3600)}h`;
      break;
    case snds < 604800:
      time = `${Math.floor(snds / 86400)}d`;
      break;
    case snds < 2419200:
      time = `${Math.floor(snds / 604800)}w`;
      break;
    case snds < 29030400:
      time = `${Math.floor(snds / 2419200)}m`;
      break;
    default:
      time = `${Math.floor(snds / 29030400)}y`;
      break;
  }

  switch (true) {
    case snds < 60 * 10:
      return `%ch%cg${time}%cn`;
    case snds < 60 * 15:
      return `%ch%cy${time}%cn`;
    case snds < 60 * 25:
      return `%ch%cy${time}%cn`;
    case snds < 60 * 60:
      return `%ch%cr${time}%cn`;
    default:
      return `%ch%cx${time}%cn`;
  }
};

export const getIdle = async (id: number) => {
  // Get the character data from database
  const char = await dbojs.queryOne({ id });
  if (!char) return idle(0);

  return idle(char.lastCommand || 0);
};
