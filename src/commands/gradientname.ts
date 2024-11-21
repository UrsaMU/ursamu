import { addCmd, send } from "../services";
import { dbojs } from "../services/Database";
import { moniker, target } from "../utils";
import { parseColors } from "../utils/colorParser";

// Color mapping for basic color names to ANSI codes
const COLOR_MAP: { [key: string]: string } = {
  "red": "\x1b[31m",
  "green": "\x1b[32m",
  "yellow": "\x1b[33m",
  "blue": "\x1b[34m",
  "magenta": "\x1b[35m",
  "cyan": "\x1b[36m",
  "white": "\x1b[37m",
  "black": "\x1b[30m",
  "purple": "\x1b[35m",
  "pink": "\x1b[35m",
  "orange": "\x1b[33m",
};

// Hex to ANSI conversion (simplified)
function hexToAnsi(hex: string): string {
  // Basic hex to color conversion
  return "\x1b[38;2;" +
    parseInt(hex.slice(1, 3), 16) + ";" +
    parseInt(hex.slice(3, 5), 16) + ";" +
    parseInt(hex.slice(5, 7), 16) + "m";
}

function convertColor(color: string): string {
  // Convert color name or hex to ANSI
  color = color.toLowerCase();
  if (color.startsWith("#")) {
    return hexToAnsi(color);
  }
  return COLOR_MAP[color] || "\x1b[37m"; // default to white
}

export default () => {
  // Add command to set gradient name
  addCmd({
    name: "gradientname",
    pattern: /^gradientname\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      let tar, vals = "";
      if (args[0].includes("=")) {
        [tar, vals] = args[0].split("=");
      } else {
        tar = "me";
        vals = args[0];
      }
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      if (!player) return;

      tar = await target(player, tar);
      if (!tar) return await send([player.id], "I can't find that character.");

      // Validate colors
      const colors = parseColors(vals);
      if (!colors) {
        return await send(
          [player.id],
          "Invalid color specification. Use color names or hex codes.",
        );
      }

      // Convert colors to ANSI codes
      const ansiColors = colors.map(convertColor);

      // Generate gradient name
      const originalName = tar.data?.name || tar.data?.moniker || "Unnamed";
      const gradientName = interpolateGradient(originalName, ansiColors);

      // Update player's name in data
      if (tar.data) {
        tar.data.name = gradientName;
      }

      // Save the updated object
      await dbojs.update({ id: tar.id }, tar);

      const displayName = moniker(player);

      await send(
        [`#${player.location}`],
        `%cy<%crOOC%cy>%cn ${displayName} has set their name to: ${gradientName}`,
      );
    },
  });
};

function interpolateGradient(name: string, colors: string[]): string {
  if (colors.length < 2) return name;

  const nameLength = name.length;
  const colorStops = colors.length - 1;
  const segmentLength = Math.floor(nameLength / colorStops);

  let gradientName = "";

  for (let i = 0; i < nameLength; i++) {
    const colorIndex = Math.min(
      Math.floor(i / segmentLength),
      colors.length - 2,
    );

    const startColor = colors[colorIndex];
    const endColor = colors[colorIndex + 1];

    const interpolatedColor = interpolateColor(
      startColor,
      endColor,
      (i % segmentLength) / segmentLength,
    );

    gradientName += `${interpolatedColor}${name[i]}`;
  }

  return gradientName + "\x1b[0m"; // Reset color at end
}

function interpolateColor(
  color1: string,
  color2: string,
  ratio: number,
): string {
  // Simple linear interpolation between two ANSI colors
  return ratio < 0.5 ? color1 : color2;
}
