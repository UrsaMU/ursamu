export interface IAttribute {
  name: string;
  value: string;
  type?: string;
  setter: string;
  hidden?: boolean;
  data?: {
    [key: string]: any;
  };
}
