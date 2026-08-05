export type Me = {
  id: string;
  dbId?: string;
  name: string;
  moniker?: string | null;
  flags: string[];
  location?: string | null;
  avatar?: string | null;
};

/** Plugin topbar contribution (from registerStaffNav / Page). */
export type StaffNavItem = {
  id: string;
  /** Human title from the plugin — nav + page H1. */
  label: string;
  /** Optional blurb from the plugin. */
  description?: string;
  href?: string;
  route?: string;
  /** In-console iframe src (route plugin-embed). */
  embed?: string;
  /**
   * Allowed origin for cross-origin embeds (PR5).
   * Same-origin embeds omit this.
   */
  embedOrigin?: string;
  /** Same-origin ESM Vue default export URL. */
  module?: string;
  order?: number;
  badgeKey?: string;
  badgeTitle?: string;
};

/** Plugin left side-nav (registerStaffSideNav). */
export type StaffSideNavItem = {
  id: string;
  label: string;
  desc?: string;
  icon?: string;
  query?: Record<string, string>;
};

export type StaffSideNavGroup = {
  title?: string;
  items: StaffSideNavItem[];
};

export type StaffSideNavRegistration = {
  pageId: string;
  groups: StaffSideNavGroup[];
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
  featured?: boolean;
  bgImage?: boolean;
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

/** In-game mail message (from /api/v1/mail). */
export type MailMessage = {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  date: number;
  read: boolean;
  replied?: boolean;
  forwarded?: boolean;
  starred?: boolean;
  folder?: "inbox" | "trash";
  expiresAt?: number;
  attachments?: string[];
};

export type MailStats = {
  total: number;
  inbox: number;
  unread: number;
  trash: number;
  quota: number;
};

/** Channel record (+ staff enrich). */
export type ChannelRow = {
  id: string;
  name: string;
  lock?: string;
  hidden?: boolean;
  header: string;
  alias?: string;
  masking?: boolean;
  owner?: string;
  logHistory?: boolean;
  historyLimit?: number;
  announce?: boolean;
  autoJoin?: boolean;
  users?: number;
};

export type ChanHistoryLine = {
  id: string;
  chanId: string;
  chanName: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
};

/** Help topic from /api/v1/help. */
export type HelpEntry = {
  name: string;
  section: string;
  content: string;
  source: "command" | "file" | "database" | string;
  tags: string[];
  hidden?: boolean;
};

export type HelpIndex = {
  sections: string[];
  topics: HelpEntry[];
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
