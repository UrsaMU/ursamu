export function formatString(input: string, length = 30): string {
  const maxLength = length;

  // If the string is shorter than the max length, pad it with spaces
  if (input.length < maxLength) {
    return input.padEnd(maxLength, " ");
  }

  // If the string is longer than the max length, truncate it and add ellipses
  if (input.length > maxLength) {
    return `${input.substring(0, maxLength - 3)}...`;
  }

  // If the string is exactly the max length, return it as is
  return input;
}
