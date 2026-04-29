export interface User {
  _id: string;
  email: string;
  username: string;
  profileImageUrl?: string;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}
