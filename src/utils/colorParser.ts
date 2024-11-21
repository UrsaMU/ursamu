export function parseColors(colorString: string): string[] | null {
  const colors = colorString.split(",").map((color) => color.trim());
  const isValidColor = (color: string) =>
    // Existing hex and named color validation
    /^#([0-9A-F]{3}){1,2}$/i.test(color) || 
    /^[a-zA-Z]+$/.test(color) ||
    // New hex color format
    /^%c<#([0-9A-F]{3}){1,2}>$/i.test(color) ||
    // New 256 color format
    /^\$%c<\d+>$/.test(color) ||
    // New RGB color format
    /^\$%c<\d+,\d+,\d+>$/.test(color);

  if (colors.every(isValidColor)) {
    return colors;
  }
  return null;
}
