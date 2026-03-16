export interface IBBoard {
  id: string;         // slugified name, used as DB key
  name: string;       // display name
  description?: string;
  order: number;      // sort order for @bblist
  readLock?: string;  // lock expression — who can read
  writeLock?: string; // lock expression — who can post
}
