export interface Tweet {
  id: string;
  url: string;
  text: string;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string;
    verified: boolean;
  };
  date: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  bookmarkCount: number;
  viewCount: number;
  isThread: boolean;
  threadTweets?: Tweet[];
  hasMedia: boolean;
  mediaUrls: string[];
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  verified: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  website: string;
  joinedDate: string;
  followersCount: number;
  followingCount: number;
  verified: boolean;
  latestPosts: Tweet[];
}

export interface Trend {
  id: string;
  topic: string;
  tweetCount: string;
  category: string;
}

export interface Notification {
  id: string;
  type: string; // "like" | "repost" | "reply" | "follow" | "mention" | "quote"
  text: string;
  fromUser: { username: string; displayName: string; avatarUrl: string };
  tweetText?: string;
  tweetUrl?: string;
  date: string; // ISO 8601
}

export interface Article {
  id: string;
  title: string;
  url: string;
  date: string;
  previewText: string;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  tweetUrl: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  tweetUrl?: string;
}
