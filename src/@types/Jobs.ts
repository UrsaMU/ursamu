import { Condition } from "./IConditions.ts";
import { IDBOBJ } from "./IDBObj.ts";

export interface Bucket extends IDBOBJ {
  id: number;
  name: string;
  description: string;
  lock: Condition;
  bypass: string[];
}

export interface Comment {
  content: string;
  createdAt: number;
  userId: number;
  public: boolean;
}

export interface Job {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  dueDate: number | null;
  priority: "Low" | "Medium" | "High";
  status: "Open" | "InProgress" | "Closed" | "OnHold";
  creatorId: number;
  assigneeId: number | null;
  bucketId: number;
  comments: Comment[];
  bypass: string[];
}
