export type QueryCondition = {
  // deno-lint-ignore no-explicit-any
  [key: string]: string | number | boolean | RegExp | QueryCondition | QueryCondition[] | string[] | number[] | any[];
};

export type QueryOperator<T> = {
  $or?: QueryCondition[];
  $and?: QueryCondition[];
  $where?: (this: T) => boolean;
};

export type Query<T> = QueryCondition | QueryOperator<T>;

/**
 * Accepts both top-level fields (`Partial<T>`) and dotted-path keys
 * (`"data.foo.bar"`) that `$set` / `$unset` / `$inc` handle at runtime.
 * Top-level field names remain auto-completed; dotted paths are allowed
 * without requiring an `as any` cast.
 *
 * @see https://github.com/UrsaMU/ursamu/issues/157
 */
export type DottedSetData<T> = Partial<T> & Record<string, any>;

export interface IDatabase<T> {
  create(data: T): Promise<T>;
  query(query?: Query<T>): Promise<T[]>;
  queryOne(query?: Query<T>): Promise<T | undefined>;
  all(): Promise<T[]>;
  modify(query: Query<T>, operator: string, data: DottedSetData<T>): Promise<T[]>;
  delete(query: Query<T>): Promise<T[]>;
  clear(): Promise<void>;
  atomicModify(id: string, transform: (current: T) => T, retries?: number): Promise<T>;
  atomicIncrement(id: string): Promise<number>;
}
