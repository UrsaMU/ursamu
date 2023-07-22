function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export const capString = (string: string) => {
  // cap first letter of string, when given several words seperated by spaces.
  // if the words starts with a '(' then capitalize the first actual letter.
  const words = string.split(" ");
  return words
    .map((word) => {
      if (word.startsWith("(")) {
        return `(${capitalizeFirstLetter(word.slice(1))}`;
      } else {
        return capitalizeFirstLetter(word);
      }
    })
    .join(" ");
};
