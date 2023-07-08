export interface IChannel {
  _id?: string;
  name: string;
  lock?: string;
  hidden?: boolean;
  header: string;
  alias?: string;
}

export interface IChanEntry {
  _id?: string;
  channel: string;
  alias: string;
  mask?: string;
  title?: string;
  active: boolean;
}
