/**
 * @module utils/pluginErrors
 *
 * Typed errors for the plugin installer pipeline.
 */

export class PluginInstallError extends Error {
  constructor(msg: string, public override cause?: unknown) {
    super(msg);
    this.name = "PluginInstallError";
  }
}

export class PluginDepNameError extends PluginInstallError {
  constructor(msg: string, cause?: unknown) {
    super(msg, cause);
    this.name = "PluginDepNameError";
  }
}

export class PluginDepUrlError extends PluginInstallError {
  constructor(msg: string, cause?: unknown) {
    super(msg, cause);
    this.name = "PluginDepUrlError";
  }
}

export class PluginCloneError extends PluginInstallError {
  constructor(msg: string, cause?: unknown) {
    super(msg, cause);
    this.name = "PluginCloneError";
  }
}

export class PluginRenameError extends PluginInstallError {
  constructor(msg: string, cause?: unknown) {
    super(msg, cause);
    this.name = "PluginRenameError";
  }
}

export class PluginVersionError extends PluginInstallError {
  constructor(msg: string, cause?: unknown) {
    super(msg, cause);
    this.name = "PluginVersionError";
  }
}

export class PluginSemverError extends PluginInstallError {
  constructor(msg: string, cause?: unknown) {
    super(msg, cause);
    this.name = "PluginSemverError";
  }
}

export class PluginConflictError extends PluginInstallError {
  constructor(msg: string, cause?: unknown) {
    super(msg, cause);
    this.name = "PluginConflictError";
  }
}
