import { viewFiles } from "../index.ts";

export const getView = (viewName: string) => {
  if (viewFiles.has(viewName)) {
    return viewFiles.get(viewName);
  } else {
    throw new Error(`View ${viewName} not found!`);
  }
};
