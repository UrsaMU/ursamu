export interface IPluginDep {
  name:    string;
  version: string;   // semver range, e.g. ">=1.0.0"
}

export interface IPlugin {
  name:          string;
  version:       string;
  description?:  string;
  dependencies?: IPluginDep[];
  init:          () => boolean | Promise<boolean>;
  remove:        () => void | Promise<void>;
}
