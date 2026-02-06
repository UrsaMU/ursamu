export interface ISandboxConfig {
  /**
   * Memory limit in MB.
   * @default 128
   */
  memoryLimit?: number;

  /**
   * CPU limit (vCPUs).
   * @default 1
   */
  cpuLimit?: number;

  /**
   * Maximum execution time in milliseconds.
   * @default 200
   */
  timeout?: number;

  /**
   * Allow-listed domains for network access.
   */
  allowNet?: string[];

  /**
   * Metadata to associate with the sandbox.
   */
  metadata?: Record<string, unknown>;
}
