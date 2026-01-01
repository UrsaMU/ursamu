
export interface IState {
    room?: {
        name: string;
        desc: string;
        exits: string[];
        players: string[];
        items: string[];
    };
    msg?: string;
    data?: Record<string, any>;
    [key: string]: any;
}

export interface IMessage {
    event: string;
    payload: IState;
    context?: Record<string, any>;
}
