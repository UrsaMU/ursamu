export interface IArticle {
  _id?: number;
  featuredImage?: string;
  category: string;
  featured?: boolean;
  title: string;
  slug: string;
  content: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: number;
}