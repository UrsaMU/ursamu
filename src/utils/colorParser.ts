export function parseColors(colorString: string): string[] | null {
  const colors = colorString.split(',').map(color => color.trim());
  const isValidColor = (color: string) => /^#([0-9A-F]{3}){1,2}$/i.test(color) || /^[a-zA-Z]+$/.test(color);

  if (colors.every(isValidColor)) {
    return colors;
  }
  return null;
}
