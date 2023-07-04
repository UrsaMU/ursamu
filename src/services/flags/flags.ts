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
    name: "Storyteller",
    code: "st",
    lvl: 8,
    lock: "admin",
  },
  {
    name: "player",
    code: "p",
    lvl: 1,
    lock: "superuser",
  },
  {
    name: "guest",
    code: "g",
    lock: "superuser",
  },
  {
    name: "Room",
    code: "r",
    lvl: 1,
    lock: "superuser",
  },
  {
    name: "connected",
    code: "c",
    lock: "superuser",
  }
);
