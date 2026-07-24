export interface IScene {
  id: string;             // Unique scene ID
  name: string;           // Title of the scene
  desc: string;           // Scene prompt / description
  owner: string;          // Player ID of the creator (dbref format: "#123")
  participants: string[]; // List of character IDs who participated
  allowed: string[];      // List of character IDs allowed (for private scenes)
  private: boolean;       // Private flag
  status: "active" | "paused" | "closed";
  sceneType: "social" | "event" | "vignette" | "plot" | "training" | "other";
  startTime: number;
  endTime?: number;
  
  // Instanced Play Location
  templateLocation: string; // The parent room ID being instanced
  instancedRoomId?: string; // The active temporary room ID where RP happens
  
  // Platform Integrations
  discordChannelId?: string; // Optional Discord channel ID bridged to this scene
  
  // Scene log entries
  poses: IScenePose[];
}

export interface IScenePose {
  id: string;
  charId: string;
  charName: string;
  moniker?: string;
  avatar?: string;
  msg: string;
  type: "pose" | "ooc" | "set";
  timestamp: number;
  source: "game" | "discord" | "web";
}
