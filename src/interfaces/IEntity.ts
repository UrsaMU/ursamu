import { IDBOBJ } from "../@types/IDBObj.ts";

export interface IEntity {
    id?: string;
    dbobj: IDBOBJ;
    name: string;
    flags: string;
    dbref: string;
    data: any;
    location?: string;
    description?: string;
    stats?: any[];

    load(obj: IDBOBJ): IEntity;
    save(): Promise<void>;
    exits(): Promise<IDBOBJ[]>;
    contents(): Promise<IDBOBJ[]>;
}
