import sheet from './sheet';
import roll from './roll';
import heal from './heal';
import damage from './damage';
import stats from './stats';

// Export an array of command functions
const commands = [sheet, roll, heal, damage, stats];

// Export a default function that initializes all commands
export default function() {
    commands.forEach(cmd => cmd());
}
