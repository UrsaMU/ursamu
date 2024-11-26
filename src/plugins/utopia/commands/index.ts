import chargenCommand from "./chargenCommand";

const initCommands: any = [chargenCommand];

export default () => {
  initCommands.forEach((cmd: () => {}) => cmd());
};
