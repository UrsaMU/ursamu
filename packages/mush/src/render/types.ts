export interface IState {
  msg?:  string;
  data?: unknown;
  room?: {
    name:  string;
    desc:  string;
    exits: string[];
  };
}
