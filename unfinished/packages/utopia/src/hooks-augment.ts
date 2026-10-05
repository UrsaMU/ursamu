export interface IUtopiaGMPayload {
  roomId: string;
  playerId: string;
  playerName: string;
  summary: string;
  autoWatch?: boolean;
}

export interface IUtopiaWeekReadyPayload {
  roomId: string;
  week: number;
  city: string;
  plans: { playerId: string; playerName: string; plan: string }[];
  summary: string;
  autoWatch?: boolean;
}

export interface IUtopiaFeedPayload {
  roomId: string;
  playerId: string;
  playerName: string;
  summary: string;
  week: number;
  autoWatch?: boolean;
}

declare module "@ursamu/mush" {
  interface GameHookMap {
    "utopia:roll": (
      p: IUtopiaGMPayload,
    ) => void | Promise<void>;
    "utopia:week:ready": (
      p: IUtopiaWeekReadyPayload,
    ) => void | Promise<void>;
    "utopia:feed:ticked": (
      p: IUtopiaFeedPayload,
    ) => void | Promise<void>;
  }
}
