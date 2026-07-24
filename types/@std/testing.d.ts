/**
 * TSServer declaration shim for jsr:@std/testing/bdd
 */

export declare function describe(
  name: string,
  fn: () => void | Promise<void>,
): void;
export declare function describe(
  name: string,
  options: unknown,
  fn: () => void | Promise<void>,
): void;
export declare function it(
  name: string,
  fn: () => void | Promise<void>,
): void;
export declare function it(
  name: string,
  options: unknown,
  fn: () => void | Promise<void>,
): void;
export declare function beforeEach(
  fn: () => void | Promise<void>,
): void;
export declare function afterEach(
  fn: () => void | Promise<void>,
): void;
export declare function beforeAll(
  fn: () => void | Promise<void>,
): void;
export declare function afterAll(
  fn: () => void | Promise<void>,
): void;
