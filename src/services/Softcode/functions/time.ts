import { registerFunction } from "./registry.ts";

registerFunction("timestring", (args) => {
  const snds = parseInt(args[0] || "0");
  if (isNaN(snds)) return "#-1 INVALID NUMBER";

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
    default:
      time = `${Math.floor(snds / 604800)}w`;
      break;
  }
  return time;
});
