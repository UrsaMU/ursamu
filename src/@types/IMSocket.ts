import { Socket } from "../../deps.ts";

export interface IMSocket extends Socket {
  id: string;
  cid?: number;
  channels?: Set<string>;
}
