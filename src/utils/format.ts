import parser from "../services/parser/parser.ts";

export const stripSubs = (list: string, string = "") => {
  return parser.stripSubs(list, parser.stripSubs("post", string));
};

export const repeatString = (string = " ", length: number) => {
  // check how many spaces are left after the filler string is rendered. We will need
  // to render these last few spaces manually.
  const remainder = Math.floor(
    length % stripSubs("telnet", string).length,
  );

  // Split the array and filter out empty cells.
  let cleanArray = string.split("%").filter(Boolean);
  // If the array length is longer than 1 (more then one cell), process for ansii
  if (cleanArray.length > 1) {
    // If it's just a clear formatting call 'cn' then we don't need to worry
    // about it.  We'll handle making sure ansii is cleared after each substitution manually.
    cleanArray = cleanArray
      .filter((cell) => {
        if (cell.toLowerCase() !== "cn") {
          return cell;
        }
      })
      // fire the substitutions on each cell.
      .map((cell) => {
        return "%" + cell + "%cn";
      });
  } else {
    cleanArray = cleanArray[0].split("");
  }
  return (
    string?.repeat(length / stripSubs("telnet", string).length) +
    cleanArray.slice(0, remainder)
  );
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
    (length - stripSubs("telnet", string).length) / 2,
  );
  const right = length -
    stripSubs("telnet", string).length - left;
  return repeatString(filler, left) + string + repeatString(filler, right);
};

export const columns = (list: string[], width = 78, cols = 3, fill = " ") => {
  const truncate = (input: any, size: any, fill: any) => {
    let length = stripSubs("telnet", input).length;
    return length > size - 3
      ? `${input.substring(0, size - 3)}...`
      : input + fill.repeat(size - length);
  };

  let cell = Math.floor(width / cols);
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

  const truncate = (input: any, size: any, fill: any) => {
    let length = parser.stripSubs("telnet", input).length;
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
