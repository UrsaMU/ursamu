// Character Generation Command for Utopia Plugin

import { IContext } from '../../../@types/IContext';
import chargenService, { CharacterOptions } from '../services/chargenService';

export const chargenCommand = {
  name: 'chargen',
  description: 'Create a new character using the Utopia chargen system.',
  execute: async (ctx: IContext, args: string[]) => {
    // Parse arguments to extract character options
    const options: CharacterOptions = {
      origin: args[0],
      specialization: args[1],
      skills: args.slice(2, 5), // Example: first three skills
      equipment: args.slice(5)  // Example: remaining arguments as equipment
    };

    // Use the chargen service to create a character
    chargenService.createCharacter(options);

    // Provide feedback to the user
    ctx.socket.emit('message', `Character created with origin: ${options.origin}, specialization: ${options.specialization}`);
  }
};

export default chargenCommand;
