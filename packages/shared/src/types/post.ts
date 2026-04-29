export interface Post {
  _id: string;
  userId: string;
  runId: string;
  caption?: string;
  imageUrls: string[];
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}
