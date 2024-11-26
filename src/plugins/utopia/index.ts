import { join } from 'path';
import { IPlugin } from '../../@types/IPlugin';
import { loadTxtDir } from '../../utils';
import commands from './commands';

const UtopiaPlugin: IPlugin = {
  meta: {
    name: 'Utopia',
    version: '1.0.0',
    description: 'Utopia v1.0 Game System Plugin',
    author: 'UrsaMU'
  },
  
  // Plugin initialization method
  async initialize() {
    // Initialize plugin-specific game logic
    commands();
    loadTxtDir(join(__dirname, 'help'));
  },

  async cleanup() {},
};

export default UtopiaPlugin;
