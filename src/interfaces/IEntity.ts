import { IDBOBJ } from "../@types/IDBObj.ts";
import { IAttribute } from "../@types/IAttribute.ts";

export interface IEntity {
    id?: string;
    dbobj: IDBOBJ;
    name: string;
    flags: string;
    dbref: string;
    data: Record<string, unknown>;
    location?: string;
    description?: string;
    stats?: IAttribute[];

    load(obj: IDBOBJ): IEntity;
    save(): Promise<void>;
    exits(): Promise<IDBOBJ[]>;
    contents(): Promise<IDBOBJ[]>;
}
