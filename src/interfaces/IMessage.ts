
export interface IState {
    room?: {
        name: string;
        desc: string;
        exits: string[];
        players: string[];
        items: string[];
    };
    msg?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface IMessage {
    event: string;
    payload: IState;
    context?: Record<string, unknown>;
}
