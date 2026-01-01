import parser from "../services/parser/parser.ts";

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
  const left = Math.floor(
    (length - parser.stripSubs("telnet", string).length) / 2
  );
  const right = length - parser.stripSubs("telnet", string).length - left;
  return repeatString(filler, left) + string + repeatString(filler, right);
};

export const columns = (list: string[], width = 78, cols = 3, fill = " ") => {
  const truncate = (input: string, size: number, fill: string) => {
    const length = parser.stripSubs("telnet", input).length;
    return length > size - 3
      ? `${input.substring(0, size - 3)}...`
      : input + fill.repeat(size - length);
  };

  const cell = Math.floor(width / cols);
  let counter = 0;
  let output = "%r%b";
  for (const item of list) {
    if (counter < cols) {
      output += truncate(item, cell, fill);
    } else {
      output += "%r%b" + truncate(item, cell, fill);
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

  const truncate = (input: string, size: number, fill: string) => {
    const length = parser.stripSubs("telnet", input).length;
    return length > size - 3
      ? `${input.substring(0, size - 3)}...`
      : input + fill.repeat(size - length);
  };

  const cols = lists.length;
  const cell = Math.floor(78 / cols);
  const longest = Math.max(...lists.map((list) => list.length));
  let output = "%r%b";
  for (let i = 0; i < longest; i++) {
    for (let j = 0; j < cols; j++) {
      output += truncate(lists[j][i] || "", cell, " ");
    }
    output += "%r%b";
  }
  return output;
};

export const header = (string = "", filler = "%cr=%cn", width = 78) => {
  return center(`%cy[%cn %ch${string}%cn %cy]%cn`, width, filler);
};

export const divider = (string = "", filler = "%cr-%cn", width = 78) => {
  return center(` %ch${string}%cn `, width, filler);
};

export const footer = (string = "", filler = "%cr=%cn", width = 78) => {
  if (string) {
    return center(`%cy[%cn %ch${string}%cn %cy]%cn`, width, filler);
  }

  return repeatString(filler, width);
};
