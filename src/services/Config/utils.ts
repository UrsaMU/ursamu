/**
 * Deep merge utility for configuration objects
 * Merges source into target, with source values taking precedence
 */
export function merge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const output = { ...target } as T;
  
  if (!source) {
    return output;
  }

  Object.keys(source).forEach((key) => {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!(key in target)) {
        Object.assign(output, { [key]: source[key] });
      } else {
        output[key as keyof T] = merge(
          output[key as keyof T] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        ) as T[keyof T];
      }
    } else {
      Object.assign(output, { [key]: source[key] });
    }
  });

  return output;
} 