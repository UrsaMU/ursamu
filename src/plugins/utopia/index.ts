import { join } from "path";
import { IPlugin } from "../../@types/IPlugin";
import { loadTxtDir } from "../../utils";
import commands from "./commands";
import { addCmd } from "../../services/commands/cmdParser";

const UtopiaPlugin: IPlugin = {
  meta: {
    name: "Utopia",
    version: "1.0.0",
    description: "Utopia v1.0 Game System Plugin",
    author: "UrsaMU",
  },

  // Plugin initialization method
  async initialize() {
    // Get the commands and register them
    const pluginCommands = commands();
    addCmd(...pluginCommands);
    
    // Load help files
    loadTxtDir(join(__dirname, "help"));
  },

  async cleanup() {},
};

export default UtopiaPlugin;
