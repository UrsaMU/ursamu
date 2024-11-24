import { IDBOBJ } from "../@types/IDBObj";
import { Obj } from "../services";
import { dbojs } from "../services/Database";

export const target = async (en: IDBOBJ, tar: string = "", global?: Boolean): Promise<Obj | null> => {
  
  // Handle special targets
  if (!tar || tar.toLowerCase() === "here") {
    const room = await Obj.get(en.location);
    return room || null;
  }
  
  if (tar.toLowerCase() === "me") {
    return new Obj().load(en);
  }


  if (tar.startsWith("#")) {
    const obj = await Obj.get(tar.slice(1));
    return obj || null;
  } else {
    const targ = await dbojs.findOne({
      $or: [
        { "data.name": new RegExp(tar, "i") },
        { "data.alias": new RegExp(tar, "i") },
        { "data.dbref": new RegExp(tar, "i") },
      ]
    });

    if(!targ) return null;

    if( en.location !== targ.location && !global ) {
      return null;
    } else if ( en.location !== targ.location && global ) {
      return new Obj().load(targ);
    } else {
      return new Obj().load(targ);
    }
  }
};
