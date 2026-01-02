/**
 * Represents a condition for querying the database.
 */
export type QueryCondition = {
    [key: string]: string | number | boolean | RegExp | QueryCondition | QueryCondition[] | string[] | number[];
};

/**
 * Represents logical operators for queries.
 */
export type QueryOperator<T> = {
    $or?: QueryCondition[];
    $and?: QueryCondition[];
    $where?: (this: T) => boolean;
};

/**
 * A query can be a direct condition or an operator.
 */
export type Query<T> = QueryCondition | QueryOperator<T>;

/**
 * Interface for database implementations.
 * @template T - The type of data stored in the database.
 */
export interface IDatabase<T> {
    create(data: T): Promise<T>;
    query(query?: Query<T>): Promise<T[]>;
    queryOne(query?: Query<T>): Promise<T | false>;
    all(): Promise<T[]>;
    modify(query: Query<T>, operator: string, data: Partial<T>): Promise<T[]>;
    delete(query: Query<T>): Promise<T[]>;
    clear(): Promise<void>;
}
