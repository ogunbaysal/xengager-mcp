export interface GqlAuthor {
  id: string;
  name: string;
  screenName: string;
  profileImageUrl: string;
  verified: boolean;
}

export interface GqlMetrics {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  views: number;
  bookmarks: number;
}

export interface GqlMedia {
  type: "photo" | "video" | "animated_gif";
  url: string;
  width?: number;
  height?: number;
}

export interface GqlTweet {
  id: string;
  text: string;
  lang: string;
  author: GqlAuthor;
  metrics: GqlMetrics;
  media: GqlMedia[];
  urls: string[];
  createdAt: string;
  isRetweet: boolean;
  retweetedBy?: string;
  quotedTweet?: GqlTweet;
  articleTitle?: string;
  articleText?: string;
  isThread?: boolean;
  replies?: GqlPaginated<GqlTweet>;
  isSubscriberOnly: boolean;
  isPromoted: boolean;
}

export interface GqlUserProfile {
  id: string;
  name: string;
  screenName: string;
  bio: string;
  location: string;
  url: string;
  followersCount: number;
  followingCount: number;
  tweetsCount: number;
  likesCount: number;
  verified: boolean;
  profileImageUrl: string;
  createdAt: string;
  /** Whether the authenticated user follows this user. `undefined` when unknown (not the authenticated user viewing). */
  isFollowing?: boolean;
}

export interface GqlBookmarkFolder {
  id: string;
  name: string;
}

export interface GqlPaginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface GqlNotification {
  id: string;
  type: string;
  text: string;
  url: string;
  timestamp: string;
  actors: GqlUserProfile[];
  tweet?: GqlTweet;
}

export interface GqlWriteResult {
  success: boolean;
  id?: string;
  url?: string;
}
