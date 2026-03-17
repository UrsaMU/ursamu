export interface IGameEvent {
  id: string;
  number: number;          // sequential in-game reference (#1, #2, ...)
  title: string;
  description: string;
  location?: string;       // free-text or room ID
  startTime: number;       // ms timestamp
  endTime?: number;        // ms timestamp
  createdBy: string;       // player ID
  createdByName: string;
  status: "upcoming" | "active" | "completed" | "cancelled";
  tags: string[];
  maxAttendees: number;    // 0 = unlimited
  createdAt: number;
  updatedAt: number;
}

export interface IEventRSVP {
  id: string;
  eventId: string;
  playerId: string;
  playerName: string;
  status: "attending" | "maybe" | "declined";
  note?: string;
  createdAt: number;
}
