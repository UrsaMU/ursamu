export interface IChannel {
  id?: number;
  name: string;
  lock?: string;
  hidden?: boolean;
  header: string;
  alias?: string;
  masking?: boolean;
}

export interface IChanEntry {
  id?: number;
  channel: string;
  alias: string;
  mask?: string;
  title?: string;
  active: boolean;
}
