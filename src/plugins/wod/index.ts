import { IPlugin } from "../../@types";
import initCommands from "./commands";
import { loadTxtDir } from "../../utils/loadTxtDir";
import path from "path";

const plugin: IPlugin = {
  name: "World of Darkness",
  version: "1.0.0",
  description: "World of Darkness character system",
  init: () => {
    // Initialize commands
    initCommands();

    // Load help files
    loadTxtDir(path.join(__dirname, "help"));

    return true; // Return true to indicate successful initialization
  },
};

export default plugin;
