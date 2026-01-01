import { djwt } from "../../deps.ts";

export interface IPayload extends djwt.Payload {
  id: string;
}
