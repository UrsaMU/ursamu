export function deepMerge(target: any, source: any): any {
  // Iterate through all properties in the source object
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      // Check if the value is an object and not null
      if (source[key] instanceof Object && source[key] !== null) {
        // If the target doesn't have this key, create an empty object
        if (!target[key]) {
          target[key] = {};
        }
        // Recursively merge the nested object
        deepMerge(target[key], source[key]);
      } else {
        // Directly assign non-object values
        target[key] = source[key];
      }
    }
  }
  return target;
}
