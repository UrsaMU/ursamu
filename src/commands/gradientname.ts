import { addCmd, send } from "../services";
import { dbojs } from "../services/Database";
import { moniker, target } from "../utils";
import { parseColors } from "../utils/colorParser";

// Color mapping for basic color names to RGB values
const COLOR_MAP: { [key: string]: number[] } = {
  // Basic Colors
  "red": [255, 0, 0],
  "green": [0, 255, 0],
  "blue": [0, 0, 255],
  "yellow": [255, 255, 0],
  "magenta": [255, 0, 255],
  "cyan": [0, 255, 255],
  "white": [255, 255, 255],
  "black": [0, 0, 0],
  
  // Reds & Pinks
  "crimson": [220, 20, 60],
  "darkred": [139, 0, 0],
  "maroon": [128, 0, 0],
  "salmon": [250, 128, 114],
  "coral": [255, 127, 80],
  "tomato": [255, 99, 71],
  "pink": [255, 192, 203],
  "hotpink": [255, 105, 180],
  "deeppink": [255, 20, 147],
  "rose": [255, 0, 127],
  
  // Oranges & Browns
  "orange": [255, 165, 0],
  "darkorange": [255, 140, 0],
  "peach": [255, 218, 185],
  "brown": [165, 42, 42],
  "chocolate": [210, 105, 30],
  "sienna": [160, 82, 45],
  "tan": [210, 180, 140],
  
  // Yellows & Golds
  "gold": [255, 215, 0],
  "goldenrod": [218, 165, 32],
  "khaki": [240, 230, 140],
  "amber": [255, 191, 0],
  "lemon": [255, 247, 0],
  
  // Greens
  "lime": [0, 255, 0],
  "forestgreen": [34, 139, 34],
  "olive": [128, 128, 0],
  "sage": [176, 208, 176],
  "emerald": [46, 204, 113],
  "mint": [189, 252, 201],
  "seagreen": [46, 139, 87],
  "teal": [0, 128, 128],
  
  // Blues
  "navy": [0, 0, 128],
  "royalblue": [65, 105, 225],
  "skyblue": [135, 206, 235],
  "turquoise": [64, 224, 208],
  "azure": [0, 127, 255],
  "cobalt": [0, 71, 171],
  "indigo": [75, 0, 130],
  
  // Purples
  "purple": [128, 0, 128],
  "violet": [238, 130, 238],
  "lavender": [230, 230, 250],
  "plum": [221, 160, 221],
  "mauve": [224, 176, 255],
  "orchid": [218, 112, 214],
  
  // Metallics
  "silver": [192, 192, 192],
  "platinum": [229, 228, 226],
  "bronze": [205, 127, 50],
  "copper": [184, 115, 51],
  
  // Nature Inspired
  "grass": [96, 128, 56],
  "ocean": [0, 119, 190],
  "sunset": [255, 111, 89],
  "storm": [72, 77, 87],
  "desert": [237, 201, 175],
  "forest": [40, 79, 40],
  
  // Modern Web Colors
  "slate": [112, 128, 144],
  "steel": [70, 130, 180],
  "ruby": [224, 17, 95],
  "sapphire": [15, 82, 186],
  "amethyst": [153, 102, 204],
  "jade": [0, 168, 107],
  "pearl": [240, 234, 214],
  "charcoal": [54, 69, 79],
  
  // Pastels
  "pastelblue": [174, 198, 207],
  "pastelpink": [255, 209, 220],
  "pastelgreen": [176, 226, 172],
  "pastelyellow": [253, 253, 150],
  "pastelpurple": [215, 192, 250],
  "pastelorange": [255, 179, 71]
};

function hexToRGB(hex: string): number[] {
  // Remove the hash if present
  hex = hex.replace('#', '');
  
  // Handle shorthand hex (#fff)
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16)
  ];
}

function colorToRGB(color: string): number[] {
  color = color.toLowerCase().trim();
  if (color.startsWith('#')) {
    return hexToRGB(color);
  }
  return COLOR_MAP[color] || [255, 255, 255]; // default to white
}

function rgbToSubCode(rgb: number[]): string {
  // Convert RGB values to hex
  const hex = rgb.map(c => {
    const hex = c.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
  
  return `%c<#${hex}>`;
}

function interpolateRGB(color1: number[], color2: number[], ratio: number): number[] {
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * ratio),
    Math.round(color1[1] + (color2[1] - color1[1]) * ratio),
    Math.round(color1[2] + (color2[2] - color1[2]) * ratio)
  ];
}

function createGradient(name: string, colors: string[]): string {
  if (colors.length < 2) return name;

  const rgbColors = colors.map(colorToRGB);
  const nameLength = name.length;
  const segments = colors.length - 1;
  let result = '';

  for (let i = 0; i < nameLength; i++) {
    // Calculate position to ensure last character gets the final color
    const position = i / Math.max(nameLength - 1, 1);
    
    // Ensure the last character gets the final color
    if (i === nameLength - 1) {
      result += rgbToSubCode(rgbColors[rgbColors.length - 1]) + name[i];
    } else {
      const segmentIndex = Math.min(Math.floor(position * segments), segments - 1);
      const segmentPosition = (position * segments) % 1;

      const interpolatedRGB = interpolateRGB(
        rgbColors[segmentIndex],
        rgbColors[segmentIndex + 1],
        segmentPosition
      );

      result += rgbToSubCode(interpolatedRGB) + name[i];
    }
  }

  return result + '%cn'; // Reset color at end
}

export default () => {
  addCmd({
    name: "gradientname",
    pattern: /^[@\+]?gradientname\s+(.*)\s*=\s*(.*)$/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      if (!player) {
        await send([ctx.socket.cid], "Player not found!");
        return;
      }

      if (!args[1]) {
        await send(
          [player.id],
          "Usage: +gradientname <name>=<color1>,<color2>,[...] or +gradientname <color1>,<color2>,[...]"
        );
        return;
      }

      const input = args[1].trim();
      let targetName = "me";
      let colorString = input;

      // Check if there's a target specified with =
      targetName = args[0].trim();
      colorString = args[1].trim();
      

      if (!colorString) {
        await send(
          [player.id],
          "Usage: +gradientname <name>=<color1>,<color2>,[...] or +gradientname <color1>,<color2>,[...]"
        );
        return;
      }

      const tar = await target(player, targetName);
      if (!tar) {
        await send([player.id], "I can't find that character.");
        return;
      }

      // Debug output for color string
      await send([player.id], `Debug - Color string: ${colorString}`);

      // Validate colors
      const colors = parseColors(colorString);
      if (!colors) {
        await send(
          [player.id],
          "Invalid color specification. Use color names (red, blue, etc) or hex codes (#ff0000)."
        );
        return;
      }

      if (colors.length < 2) {
        await send(
          [player.id],
          "Please specify at least two colors for the gradient."
        );
        return;
      }

      // Debug output for colors array
      await send([player.id], `Debug - Colors array: ${JSON.stringify(colors)}`);

      // Generate gradient name
      const originalName = tar.data?.name || "Unnamed";
      const gradientName = createGradient(originalName, colors);

      // Debug output for gradient name
      await send([player.id], `Debug - Generated gradient name: ${gradientName}`);

      // Update player's moniker in data
      if (!tar.data) tar.data = {};
      tar.data.moniker = gradientName;

      // Save the updated object
      await dbojs.update({ id: tar.id }, tar);

      // Send success message
      await send(
        [`#${player.location}`],
        `%cy<%crOOC%cy>%cn ${moniker(player)} has set their name to: ${tar.data.moniker}`
      );
    },
  });
};
