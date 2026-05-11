import parser from "../services/parser/parser.ts";

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/** Capitalize the first letter of each word, handling leading parentheses. */
function capitalizeFirstLetter(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const capString = (string: string): string => {
  return string.split(" ").map(word =>
    word.startsWith("(")
      ? `(${capitalizeFirstLetter(word.slice(1))}`
      : capitalizeFirstLetter(word),
  ).join(" ");
};

/** Pad or truncate `input` to exactly `length` characters. */
export function formatString(input: string, length = 30): string {
  if (input.length < length) return input.padEnd(length, " ");
  if (input.length > length) return `${input.substring(0, length - 3)}...`;
  return input;
}

// ---------------------------------------------------------------------------
// Stat display
// ---------------------------------------------------------------------------

/** Format a stat label + numeric value as a MUSH-colored key...value line. */
export const formatStat = (stat: string, value: unknown, width = 24, right = false): string => {
  const valStr     = String(value ?? "");
  const hasVal     = valStr !== "" && valStr !== "0" ? "" : "%ch%cx";
  const valDisplay = valStr !== "" && valStr !== "0" ? `%ch${valStr}%cn` : "%ch%cx0%cn";
  if (!right) {
    return ljust(`${hasVal}${capString(stat)}`, width - (valStr.length || 1), "%ch%cx.%cn") + valDisplay;
  }
  return ljust(`${valStr.length > 0 ? "" : "%ch%cx"}${capString(stat)}:`, 12) + ljust(`%ch${capString(valStr)}%cn`, 25);
};

export const repeatString = (string = " ", length: number) => {
  // If length is 0 or negative, return empty string
  if (length <= 0) return "";
  
  // If string is empty, return empty string
  if (!string) return "";
  
  // Get the effective length of the string without ANSI codes
  const strippedLength = parser.stripSubs("telnet", string).length;
  
  // If the stripped length is 0, we can't repeat it meaningfully
  if (strippedLength === 0) return "";
  
  // Calculate how many complete repetitions we need
  const repetitions = Math.floor(length / strippedLength);
  
  // Calculate the remainder for partial repetition
  const remainder = length % strippedLength;
  
  // For simple strings without formatting codes, use the built-in repeat
  if (!string.includes("%")) {
    return string.repeat(repetitions) + (remainder > 0 ? string.substring(0, remainder) : "");
  }
  
  // For strings with formatting codes, we need special handling
  // Get the repeated part
  const repeatedPart = repetitions > 0 ? string.repeat(repetitions) : "";
  
  // If there's no remainder, return just the repeated part
  if (remainder === 0) return repeatedPart;
  
  // Handle the remainder part with ANSI codes
  // Split the string by % and process for ANSI codes
  let cleanArray = string.split("%").filter(Boolean);
  
  if (cleanArray.length > 1) {
    // Process ANSI codes
    cleanArray = cleanArray
      .filter(cell => cell.toLowerCase() !== "cn")
      .map(cell => "%" + cell + "%cn");
  } else {
    if (cleanArray.length === 0) return "";
    cleanArray = cleanArray[0].split("");
  }
  
  // Return the repeated part plus the remainder
  return repeatedPart + cleanArray.slice(0, remainder).join("");
};

export const rjust = (string = "", length: number, filler = " ") => {
  const len = length - parser.stripSubs("telnet", string).length;

  if (len < 0) {
    return string.substring(0, length - 3) + "...";
  } else {
    return repeatString(filler, len) + string;
  }
};
export const ljust = (string = "", length: number, filler = " ") => {
  const len = length - parser.stripSubs("telnet", string).length;

  if (len < 0) {
    return string.substring(0, length - 3) + "...";
  } else {
    return string + repeatString(filler, len);
  }
};

export const center = (string = "", length: number, filler = " ") => {
  const strLen = parser.stripSubs("telnet", string).length;
  const left   = Math.floor((length - strLen) / 2);
  const right  = length - strLen - left;
  return repeatString(filler, left) + string + repeatString(filler, right);
};

/** Pad or truncate `input` to exactly `size` visible characters, using `fill` for padding. */
function truncateCell(input: string, size: number, fill: string): string {
  if (size <= 3) return input.substring(0, size);
  const length = parser.stripSubs("telnet", input).length;
  return length > size - 3
    ? `${input.substring(0, size - 3)}...`
    : input + fill.repeat(size - length);
}

export const columns = (list: string[], width = 78, cols = 3, fill = " ") => {
  const cell = Math.floor(width / cols);
  let counter = 0;
  let output = "%r%b";
  for (const item of list) {
    if (counter < cols) {
      output += truncateCell(item, cell, fill);
    } else {
      output += "%r%b" + truncateCell(item, cell, fill);
      counter = 0;
    }
    counter++;
  }

  return output;
};

export const threeColumn = (...lists: string[][]) => {
  // create columns based on the number of lists.  Then find the longest list.
  // print i from each list, then increment i and repeat until all lists are
  // exhausted.  If the list is shorter than the longest list, pad it with empty
  // strings.

  const cols = lists.length;
  const cell = Math.floor(78 / cols);
  const longest = Math.max(...lists.map((list) => list.length));
  let output = "%r%b";
  for (let i = 0; i < longest; i++) {
    for (let j = 0; j < cols; j++) {
      output += truncateCell(lists[j][i] || "", cell, " ");
    }
    output += "%r%b";
  }
  return output;
};

// NOTE: TS header/divider/footer diverge from the softcode versions in
// src/services/Softcode/stdlib/string.ts. The softcode forms are inline
// single-line layouts (e.g. `===== Title ===…`) for use in attribute strings;
// these TS forms are multi-line block decorators tailored to native command
// output (plain `=`/`-` rules with a bold title sandwiched between).

export const header = (string = "", filler = "=", width = 78) => {
  const rule = filler.repeat(width);
  if (!string) return rule;
  return `${rule}\n${center(`%ch${string}%cn`, width)}\n${rule}`;
};

export const divider = (string = "", filler = "-", width = 78) => {
  const rule = filler.repeat(width);
  if (!string) return rule;
  return `\n%ch${string}%cn\n${rule}`;
};

export const footer = (string = "", filler = "=", width = 78) => {
  const rule = filler.repeat(width);
  if (!string) return rule;
  return `${rule}\n${center(`%ch${string}%cn`, width)}\n${rule}`;
};
