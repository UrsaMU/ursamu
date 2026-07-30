export type Me = {
  id: string;
  dbId?: string;
  name: string;
  moniker?: string | null;
  flags: string[];
  location?: string | null;
  avatar?: string | null;
};

/** Plugin topbar contribution (from registerStaffNav). */
export type StaffNavItem = {
  id: string;
  /** Human title from the plugin — nav + page H1. */
  label: string;
  /** Optional blurb from the plugin. */
  description?: string;
  href?: string;
  route?: string;
  order?: number;
  badgeKey?: string;
  badgeTitle?: string;
};

/** Live badge from setStaffBadge / WS badge:set. */
export type StaffBadge = {
  key: string;
  value: string;
  title?: string;
};

export type WikiStub = {
  path: string;
  title: string;
  type?: string;
  draft?: boolean;
  author?: string;
  date?: string;
  readLock?: string;
  tags?: string[];
  chars?: number;
};

export type OnlinePlayer = {
  id?: string;
  name?: string;
  moniker?: string | null;
};

export type DboStub = {
  id?: string;
  flags?: string | string[];
  location?: string;
  description?: string;
  data?: Record<string, unknown>;
};

export type ObjectListResponse = {
  objects?: DboStub[];
  total?: number;
  items?: DboStub[];
  results?: DboStub[];
};

export type JobStatus =
  | "new"
  | "open"
  | "closed"
  | "cancelled"
  | "resolved";

export type JobPriority = "low" | "normal" | "high" | "critical";

export type JobComment = {
  id?: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  staffOnly?: boolean;
};

export type Job = {
  id: string;
  number: number;
  title: string;
  bucket?: string;
  category?: string;
  status: JobStatus | string;
  priority?: JobPriority | string;
  staffOnly?: boolean;
  submittedBy: string;
  submitterName: string;
  assignedTo?: string;
  assigneeName?: string;
  description: string;
  comments: JobComment[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
};

export type JobStats = {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  openAssigned: number;
  openUnassigned: number;
};

/** BBS board (from /api/v1/boards). */
export type BbsBoard = {
  id: string;
  num: number;
  title: string;
  timeout?: number;
  anonymous?: boolean;
  readLock?: string;
  writeLock?: string;
  pendingDelete?: boolean;
  category?: string;
  type?: "normal" | "archive" | string;
  ownerId?: string;
  moderators?: string[];
  webhookUrl?: string;
  archiveTo?: string;
  postCount?: number;
  unreadCount?: number;
  flaggedCount?: number;
};

export type BbsFlag = {
  playerId: string;
  playerName: string;
  reason: string;
  createdAt: number;
};

export type BbsReply = {
  num: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  editCount?: number;
  icTag?: "ic" | "ooc";
};

export type BbsPost = {
  id: string;
  boardId: number;
  num: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  timeout?: number;
  editCount?: number;
  replies?: BbsReply[];
  sticky?: boolean;
  icTag?: "ic" | "ooc";
  sceneId?: string | null;
  tags?: string[];
  flags?: BbsFlag[];
  watchers?: string[];
};

export type BbsPostsResponse = {
  total: number;
  posts: BbsPost[];
};
