import parser from "../services/parser/parser.ts";

export const substitution = (string: string, list: { [key: string]: any }) => {
  for (const [key, val] of Object.entries(list)) {
    string = string.replace(key, val);
  }

  return parser.substitute("post", parser.substitute("pre", string));
};
