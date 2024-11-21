import { IPlugin } from "../../@types";
import initCommands from "./commands";
import { loadTxtDir } from "../../utils/loadTxtDir";
import path from "path";

const plugin: IPlugin = {
  meta: {
    name: "World of Darkness",
    version: "1.0.0",
    description: "World of Darkness character system",
    author: "UrsaMU"
  },
  initialize: async () => {
    // Initialize commands
    initCommands();

    // Load help files
    loadTxtDir(path.join(__dirname, "help"));
  }
};

export default plugin;
