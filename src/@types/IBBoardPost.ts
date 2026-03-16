export interface IBBoardPost {
  id: string;          // UUID
  board: string;       // board ID this post belongs to
  num: number;         // sequential post number within the board
  subject: string;
  body: string;
  author: string;      // player ID
  authorName: string;  // cached display name at time of posting
  date: number;        // ms timestamp
  edited?: number;     // ms timestamp of last edit
}
