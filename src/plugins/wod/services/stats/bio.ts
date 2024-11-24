import { IMStat } from "../../../../@types";

export const bio: IMStat[] = [
  {
    name: "full name",
    values: [],
    type: "bio",
  },
  {
    name: "concept",
    values: [],
    type: "bio",
  },
  {
    name: "Birth Date",
    values: [],
    type: "bio",
  },

  {
    name: "template",
    values: ["vampire", "mortal", "ghoul"],
    type: "bio",
    lock: "builder+",
  },
  {
    name: "auspice",
    values: ["ahroun, galliard, philodox, theurge, ragabash"],
    type: "bio",
    template: ["werewolf"],
  },
  {
    name: "tribe",
    values: [
      "black furies",
      "bone gnawers",
      "children of gaia",
      "fianna",
      "glass walkers",
      "red talons",
      "shadow lords",
      "silent striders",
      "silver fangs",
      "stargazers",
      "ghost council",
    ],
    type: "bio",
    template: ["werewolf"],
  },
  {
    name: "ambition",
    values: [],
    type: "bio",
  },
  {
    name: "desire",
    values: [],
    type: "bio",
  },
  {
    name: "Predator",
    values: [],
    type: "bio",
    template: ["vampire"],
  },
  {
    name: "clan",
    values: [],
    type: "bio",
    template: ["vampire"],
  },
  {
    name: "generation",
    values: [],
    type: "bio",
    template: ["vampire"],
  },
];
