import { hash } from "bcryptjs";

type data = {
  [key: string]: any;
};

export const createCharacter = async (
  createObj: Function,
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

export const getCharacter = async (dbojs: any, id?: number) => {
  let character = await dbojs.findOne({ id });
  return character;
};
