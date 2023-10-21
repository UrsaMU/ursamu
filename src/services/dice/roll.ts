export const roll = (numDice: number) => {
  const dice = [];

  // roll numDice d10s
  for (let i = 0; i < numDice; i++) {
    dice.push(Math.floor(Math.random() * 10) + 1);
  }

  return dice;
};
