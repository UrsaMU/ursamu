
import { createObj, dbojs } from "../../../services";
import { createCharacter, getCharacter } from "./character";

export const diContainer = {
  createCharacter: (name: string, password: string, flags: string, data?: any) =>
    createCharacter(createObj, name, password, flags, data),
  getCharacter: (id?: number) => getCharacter(dbojs, id),
};
