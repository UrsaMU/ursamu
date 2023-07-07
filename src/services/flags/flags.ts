import { Tags } from "@digibear/tags";

export const flags = new Tags(
  {
    name: "superuser",
    code: "su",
    lvl: 10,
    lock: "superuser",
  },
  {
    name: "admin",
    code: "a",
    lvl: 9,
    lock: "superuser",
  },
  {
    name: "storyteller",
    code: "st",
    lvl: 8,
    lock: "admin",
  },
  {
    name: "builder",
    code: "b",
    lvl: 7,
    lock: "admin",
  },
  {
    name: "player",
    code: "p",
    lvl: 1,
    lock: "superuser",
  },
  {
    name: "safe",
    code: "s",
  },
  {
    name: "void",
    code: "v",
    lock: "superuser",
  },
  {
    name: "dark",
    code: "d",
  },
  {
    name: "guest",
    code: "g",
    lock: "superuser",
  },
  {
    name: "room",
    code: "r",
    lvl: 1,
    lock: "superuser",
  },
  {
    name: "exit",
    code: "e",
    lvl: 1,
    lock: "superuser",
  },
  {
    name: "connected",
    code: "c",
    lock: "superuser",
  }
);
