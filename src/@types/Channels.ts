export interface IChannel {
  id: string;
  name: string;
  lock?: string;
  hidden?: boolean;
  header: string;
  alias?: string;
  masking?: boolean;
}

export interface IChanEntry {
  id: string;
  channel: string;
  alias: string;
  mask?: string;
  title?: string;
  active: boolean;
}
