import parser from "../services/parser/parser";

export const repeatString = (string = " ", length: number) => {
  // check how many spaces are left after the filler string is rendered. We will need
  // to render these last few spaces manually.
  const remainder = Math.floor(
    length % parser.stripSubs("telnet", string).length
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
    string?.repeat(length / parser.stripSubs("telnet", string).length) +
    cleanArray.slice(0, remainder)
  );
};

export const rjust = (string = "", length: number, filler = " ") => {
  return (
    repeatString(filler, length - parser.stripSubs("telnet", string).length) +
    string
  );
};

export const ljust = (string = "", length: number, filler = " ") => {
  return string + repeatString(filler, length - string.length);
};

export const center = (string = "", length: number, filler = " ") => {
  const left = Math.floor(
    (length - parser.stripSubs("telnet", string).length) / 2
  );
  const right = length - parser.stripSubs("telnet", string).length - left;
  return repeatString(filler, left) + string + repeatString(filler, right);
};

export const columns = (list: string[], width = 78, cols = 3, fill = " ") => {
  const truncate = (input: any, size: any, fill: any) => {
    let length = parser.stripSubs("telnet", input).length;
    return length > size - 3
      ? `${input.substring(0, size - 3)}...`
      : input + fill.repeat(size - length);
  };

  let cell = Math.floor(width / cols);
  let counter = 0;
  let output = "%r";
  for (const item of list) {
    if (counter < cols) {
      output += truncate(item, cell, fill);
    } else {
      output += "%r" + truncate(item, cell, fill);
      counter = 0;
    }
    counter++;
  }

  return output;
};
