---
category: Character Creation
---
# Setting Specialties and Powers

This help file explains how to set skill specialties and discipline powers for your character.

## Setting Specialties
`+stat <stat>=<value>/<specialty>` - Sets a stat with a specialty
- If no player specified, sets for yourself
- Staff members can set for other players
- To remove a specialty, set its value to zero

## Setting Powers
The same format is used for setting discipline powers:
`+stat <discipline>=<level>/<power>` - Sets a discipline power

## Examples
```
# Set a skill specialty
+stat brawl=3/boxing

# Set a discipline power
+stat dominate=3/forgetful_mind

# Remove a specialty
+stat brawl=0/boxing
```

## Important Notes
- You can have multiple specialties for the same skill
- Powers must be valid for the discipline level
- Removing a stat will remove all its specialties
- Staff approval may be required for certain specialties or powers
