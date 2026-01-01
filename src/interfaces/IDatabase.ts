export type QueryCondition = {
    [key: string]: string | number | boolean | RegExp | QueryCondition | QueryCondition[] | string[] | number[];
};

export type QueryOperator<T> = {
    $or?: QueryCondition[];
    $and?: QueryCondition[];
    $where?: (this: T) => boolean;
};

export type Query<T> = QueryCondition | QueryOperator<T>;

export interface IDatabase<T> {
    create(data: T): Promise<T>;
    query(query?: Query<T>): Promise<T[]>;
    queryOne(query?: Query<T>): Promise<T | false>;
    all(): Promise<T[]>;
    modify(query: Query<T>, operator: string, data: Partial<T>): Promise<T[]>;
    delete(query: Query<T>): Promise<T[]>;
    clear(): Promise<void>;
}
