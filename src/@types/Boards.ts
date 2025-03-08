export interface IPost {
  postId: string;
  boardId: string;
  authorId: string; // Assuming author is identified by an ID
  title: string;
  content: string;
  timestamp: Date;
  isLocked: boolean;
}

export interface IBoard {
  id: string;
  boardId: string;
  name: string;
  read?: string;
  write?: string;
  description: string;
  category?: string; // Optional, if you're using categories
  permissions?: string; // Optional, permissions as a string
  posts?: IPost[]; // Optional, to store posts if needed
  lastPost?: Date; // Optional, to store the last post
}
