import { createObj } from "../DBObjs/DBObjs.ts";
import { hash } from "../../../deps.ts";
import { dbojs } from "../Database/index.ts";

type data = {
  [key: string]: any;
};

export const createCharacter = async (
  name: string,
  password: string,
  flags: string,
  data?: data
) => {
  const character = await createObj(flags, {
    name,
    password: await hash(password, 10),
    ...data,
  });

  return character;
};

export const getCharacter = async (id?: number) => {
  let character = await dbojs.query({ id });
  return character.length ? character[0] : false;
};
