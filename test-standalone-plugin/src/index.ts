/**
 * Standalone UrsaMU Plugin
 */
const plugin = {
  name: "test-standalone-plugin",
  version: "1.0.0",
  description: "A description for test-standalone-plugin",
  
  /**
   * Initialization logic for the plugin
   * @returns {boolean | Promise<boolean>}
   */
  init: () => {
    console.log("test-standalone-plugin plugin initialized!");
    return true;
  }
};

export default plugin;
