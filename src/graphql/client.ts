import type { Page } from "puppeteer";
import { existsSync, statSync } from "fs";
import { extname } from "path";
import { withReadPage, withWritePage } from "../browser.js";
import {
  BEARER_TOKEN,
  QUERY_IDS,
  DEFAULT_FEATURES,
  NOTIFICATIONS_FEATURES,
  USER_BY_SCREEN_NAME_FEATURES,
  buildGraphqlUrl,
  compactFeatures,
} from "./constants.js";
import {
  deepGet,
  parseTweetResult,
  parseTimelineResponse,
  parseUserResult,
  parseUserListResponse,
  parseNotificationsResponse,
} from "./parser.js";
import type { GqlTweet, GqlUserProfile, GqlBookmarkFolder, GqlPaginated, GqlWriteResult, GqlNotification } from "./types.js";

// ── Errors ────────────────────────────────────────────────────────────────

export class TwitterAuthError extends Error {
  constructor(message = "Session expired — check X_AUTH_TOKEN and X_CT0 in .env") {
    super(message);
    this.name = "TwitterAuthError";
  }
}

export class TwitterRateLimitError extends Error {
  constructor(message = "Rate limited — try again later") {
    super(message);
    this.name = "TwitterRateLimitError";
  }
}

export class TwitterAPIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TwitterAPIError";
  }
}

function qid(operationName: string): string {
  return QUERY_IDS[operationName] ?? operationName;
}

// ── HTTP via page.evaluate ────────────────────────────────────────────────

async function getCt0(page: Page): Promise<string> {
  try {
    const cookies = await page.cookies("https://x.com");
    const ct0 = cookies.find((c) => c.name === "ct0")?.value;
    if (ct0) return ct0;
  } catch {
    // page.cookies unavailable (e.g. in tests with minimal mock)
  }
  return process.env.X_CT0 ?? "";
}

/** Shared fetch evaluator — runs inside the browser context. */
const FETCH_EVAL = async (reqUrl: string, init: RequestInit) => {
  const r = await fetch(reqUrl, init);
  const json = await r.json();
  return { status: r.status, body: json };
};

function baseHeaders(ct0: string): Record<string, string> {
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "X-Csrf-Token": ct0,
    "X-Twitter-Active-User": "yes",
    "X-Twitter-Auth-Type": "OAuth2Session",
    "Content-Type": "application/json",
  };
}

async function gqlGet(page: Page, url: string, extraHeaders: Record<string, string> = {}): Promise<any> {
  const ct0 = await getCt0(page);
  const result = await (page as any).evaluate(FETCH_EVAL, url, {
    method: "GET",
    headers: { ...baseHeaders(ct0), ...extraHeaders },
  } as RequestInit);
  return handleResponse(result);
}

async function gqlPost(
  page: Page,
  operationName: string,
  variables: Record<string, unknown>,
  features?: Record<string, boolean>,
): Promise<any> {
  const ct0 = await getCt0(page);
  const queryId = qid(operationName);
  const url = `https://x.com/i/api/graphql/${queryId}/${operationName}`;
  const body: Record<string, unknown> = { variables, queryId };
  if (features) body.features = compactFeatures(features);

  const result = await (page as any).evaluate(FETCH_EVAL, url, {
    method: "POST",
    headers: { ...baseHeaders(ct0), "Referer": "https://x.com/compose/post" },
    body: JSON.stringify(body),
  } as RequestInit);
  return handleResponse(result);
}

function handleResponse(result: { status: number; body: any } | any): any {
  const status: number = result?.status ?? 200;
  const body: any = result?.body ?? result;

  if (status === 401 || status === 403) throw new TwitterAuthError();
  if (status === 429) throw new TwitterRateLimitError();
  if (status >= 400) throw new TwitterAPIError(status, `Twitter API error ${status}`);

  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    const err = body.errors[0];
    if (err.code === 88 || err.code === 215) throw new TwitterRateLimitError(err.message);
    if (err.code === 348 || err.code === 349)
      throw new TwitterRateLimitError("Rate limited — try again in 15+ minutes");
    throw new TwitterAPIError(0, `Twitter API: ${err.message ?? "Unknown error"}`);
  }

  return body;
}

// ── Client ────────────────────────────────────────────────────────────────

export class TwitterGraphQLClient {
  // ── Read: timelines ─────────────────────────────────────────────────

  async fetchHomeTimeline(count = 20, cursor?: string): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        count,
        includePromotedContent: false,
        latestControlAvailable: true,
        requestContext: "launch",
      };
      if (cursor) variables.cursor = cursor;
      const url = buildGraphqlUrl(qid("HomeTimeline"), "HomeTimeline", variables, DEFAULT_FEATURES);
      const data = await gqlGet(page, url);
      return parseTimelineResponse(
        data,
        (d: any) => deepGet(d, "data", "home", "home_timeline_urt", "instructions"),
      );
    });
  }

  async fetchFollowingFeed(count = 20, cursor?: string): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        count,
        includePromotedContent: false,
        latestControlAvailable: true,
      };
      if (cursor) variables.cursor = cursor;
      const url = buildGraphqlUrl(
        qid("HomeLatestTimeline"),
        "HomeLatestTimeline",
        variables,
        DEFAULT_FEATURES,
      );
      const data = await gqlGet(page, url);
      return parseTimelineResponse(
        data,
        (d: any) => deepGet(d, "data", "home", "home_timeline_urt", "instructions"),
      );
    });
  }

  async fetchNotifications(
    count = 20,
    cursor?: string,
    timelineType: "All" | "Mentions" | "Verified" = "All",
  ): Promise<GqlPaginated<GqlNotification>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        timeline_type: timelineType,
        count,
      };
      if (cursor) variables.cursor = cursor;
      const url = buildGraphqlUrl(
        qid("NotificationsTimeline"),
        "NotificationsTimeline",
        variables,
        NOTIFICATIONS_FEATURES,
      );
      const data = await gqlGet(page, url, {
        Referer: "https://x.com/notifications",
        "X-Twitter-Client-Language": "en",
      });
      return parseNotificationsResponse(data);
    });
  }

  async fetchBookmarks(count = 50, cursor?: string): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = { count };
      if (cursor) variables.cursor = cursor;
      const url = buildGraphqlUrl(qid("Bookmarks"), "Bookmarks", variables, DEFAULT_FEATURES);
      const data = await gqlGet(page, url);
      return parseTimelineResponse(data, (d: any) => {
        return (
          deepGet(d, "data", "bookmark_timeline", "timeline", "instructions") ??
          deepGet(d, "data", "bookmark_timeline_v2", "timeline", "instructions")
        );
      });
    });
  }

  async fetchBookmarkFolders(): Promise<GqlBookmarkFolder[]> {
    return withReadPage(async (page) => {
      const url = buildGraphqlUrl(
        qid("BookmarkFoldersSlice"),
        "BookmarkFoldersSlice",
        {},
        DEFAULT_FEATURES,
      );
      const data = await gqlGet(page, url);
      const sliceData = deepGet(
        data,
        "data",
        "viewer",
        "user_results",
        "result",
        "bookmark_collections_slice",
      );
      if (!sliceData) return [];
      return (sliceData.items ?? []).map((item: any) => ({ id: item.id ?? "", name: item.name ?? "" }));
    });
  }

  async fetchBookmarkFolderTimeline(folderId: string, count = 50): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        count,
        bookmark_collection_id: folderId,
        includePromotedContent: false,
      };
      const url = buildGraphqlUrl(
        qid("BookmarkFolderTimeline"),
        "BookmarkFolderTimeline",
        variables,
        DEFAULT_FEATURES,
      );
      const data = await gqlGet(page, url);
      return parseTimelineResponse(
        data,
        (d: any) => deepGet(d, "data", "bookmark_collection_timeline", "timeline", "instructions"),
      );
    });
  }

  async fetchSearch(
    query: string,
    count = 20,
    product: "Top" | "Latest" | "Photos" | "Videos" = "Top",
  ): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        rawQuery: query,
        count,
        querySource: "typed_query",
        product,
      };
      const data = await gqlPost(page, "SearchTimeline", variables, DEFAULT_FEATURES);
      return parseTimelineResponse(
        data,
        (d: any) =>
          deepGet(d, "data", "search_by_raw_query", "search_timeline", "timeline", "instructions"),
      );
    });
  }

  async fetchListTimeline(
    listId: string,
    count = 20,
    cursor?: string,
  ): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = { listId, count };
      if (cursor) variables.cursor = cursor;
      const url = buildGraphqlUrl(
        qid("ListLatestTweetsTimeline"),
        "ListLatestTweetsTimeline",
        variables,
        DEFAULT_FEATURES,
      );
      const data = await gqlGet(page, url);
      return parseTimelineResponse(
        data,
        (d: any) => deepGet(d, "data", "list", "tweets_timeline", "timeline", "instructions"),
      );
    });
  }

  async fetchTweetDetail(tweetId: string, count = 20, cursor?: string): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        focalTweetId: tweetId,
        count,
        referrer: "tweet",
        with_rux_injections: false,
        includePromotedContent: true,
        withCommunity: true,
        withQuickPromoteEligibilityTweetFields: true,
        withBirdwatchNotes: true,
        withVoice: true,
      };
      if (cursor) variables.cursor = cursor;
      const fieldToggles = {
        withArticleRichContentState: true,
        withArticlePlainText: false,
        withGrokAnalyze: false,
        withDisallowedReplyControls: false,
      };
      const url = buildGraphqlUrl(
        qid("TweetDetail"),
        "TweetDetail",
        variables,
        DEFAULT_FEATURES,
        fieldToggles,
      );
      const data = await gqlGet(page, url);
      return parseTimelineResponse(data, (d: any) => {
        return (
          deepGet(d, "data", "tweetResult", "result", "timeline", "instructions") ??
          deepGet(d, "data", "threaded_conversation_with_injections_v2", "instructions")
        );
      });
    });
  }

  async fetchTweetById(tweetId: string): Promise<GqlTweet> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        tweetId,
        withCommunity: false,
        includePromotedContent: false,
        withVoice: false,
      };
      const features: Record<string, boolean> = {
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
      };
      const url = buildGraphqlUrl(
        qid("TweetResultByRestId"),
        "TweetResultByRestId",
        variables,
        features,
        { withArticleRichContentState: true, withArticlePlainText: false },
      );
      const data = await gqlGet(page, url);
      const result = deepGet(data, "data", "tweetResult", "result");
      if (!result) throw new TwitterAPIError(0, `Tweet not found: ${tweetId}`);
      const tweet = parseTweetResult(result);
      if (!tweet) throw new TwitterAPIError(0, `Failed to parse tweet: ${tweetId}`);
      return tweet;
    });
  }

  async fetchArticle(tweetId: string): Promise<GqlTweet> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        tweetId,
        withCommunity: false,
        includePromotedContent: false,
        withVoice: false,
      };
      const features: Record<string, boolean> = {
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        articles_preview_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
      };
      const url = buildGraphqlUrl(
        qid("TweetResultByRestId"),
        "TweetResultByRestId",
        variables,
        features,
        { withArticleRichContentState: true, withArticlePlainText: true },
      );
      const data = await gqlGet(page, url);
      const result = deepGet(data, "data", "tweetResult", "result");
      if (!result) throw new TwitterAPIError(0, `Article not found: ${tweetId}`);
      const tweet = parseTweetResult(result);
      if (!tweet) throw new TwitterAPIError(0, `Failed to parse article: ${tweetId}`);
      if (tweet.articleTitle == null && tweet.articleText == null) {
        throw new TwitterAPIError(0, `Tweet ${tweetId} has no article content`);
      }
      return tweet;
    });
  }

  // ── Read: users ──────────────────────────────────────────────────────

  async fetchUser(screenName: string): Promise<GqlUserProfile> {
    const name = screenName.replace(/^@/, "");
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = { screen_name: name, withSafetyModeUserFields: true };
      const url = buildGraphqlUrl(
        qid("UserByScreenName"),
        "UserByScreenName",
        variables,
        USER_BY_SCREEN_NAME_FEATURES,
      );
      const data = await gqlGet(page, url);
      const result = deepGet(data, "data", "user", "result");
      if (!result) throw new TwitterAPIError(0, `User @${name} not found`);
      const user = parseUserResult(result);
      if (!user) throw new TwitterAPIError(0, `User @${name} not found`);
      return user;
    });
  }

  async fetchUserTweets(userId: string, count = 20, cursor?: string): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        userId,
        count,
        includePromotedContent: true,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
        withV2Timeline: true,
      };
      if (cursor) variables.cursor = cursor;
      const url = buildGraphqlUrl(qid("UserTweets"), "UserTweets", variables, DEFAULT_FEATURES);
      const data = await gqlGet(page, url);
      return parseTimelineResponse(data, (d: any) => {
        return (
          deepGet(d, "data", "user", "result", "timeline", "timeline", "instructions") ??
          deepGet(d, "data", "user", "result", "timeline_v2", "timeline", "instructions")
        );
      });
    });
  }

  async fetchUserLikes(userId: string, count = 20, cursor?: string): Promise<GqlPaginated<GqlTweet>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = {
        userId,
        count,
        includePromotedContent: false,
        withClientEventToken: false,
        withBirdwatchNotes: false,
        withVoice: true,
      };
      if (cursor) variables.cursor = cursor;
      const url = buildGraphqlUrl(qid("Likes"), "Likes", variables, DEFAULT_FEATURES);
      const data = await gqlGet(page, url);
      return parseTimelineResponse(data, (d: any) => {
        return (
          deepGet(d, "data", "user", "result", "timeline", "timeline", "instructions") ??
          deepGet(d, "data", "user", "result", "timeline_v2", "timeline", "instructions")
        );
      });
    });
  }

  async fetchFollowers(userId: string, count = 20, cursor?: string): Promise<GqlPaginated<GqlUserProfile>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = { userId, count, includePromotedContent: false };
      if (cursor) variables.cursor = cursor;
      const data = await gqlPost(page, "Followers", variables);
      return parseUserListResponse(
        data,
        (d: any) => deepGet(d, "data", "user", "result", "timeline", "timeline", "instructions"),
      );
    });
  }

  async fetchFollowing(userId: string, count = 20, cursor?: string): Promise<GqlPaginated<GqlUserProfile>> {
    return withReadPage(async (page) => {
      const variables: Record<string, unknown> = { userId, count, includePromotedContent: false };
      if (cursor) variables.cursor = cursor;
      const data = await gqlPost(page, "Following", variables);
      return parseUserListResponse(
        data,
        (d: any) => deepGet(d, "data", "user", "result", "timeline", "timeline", "instructions"),
      );
    });
  }

  async fetchMe(): Promise<GqlUserProfile> {
    const screenName = await withReadPage(async (page) => {
      const ct0 = await getCt0(page);
      const result = await (page as any).evaluate(
        FETCH_EVAL,
        "https://x.com/i/api/1.1/account/multi/list.json",
        { method: "GET", headers: baseHeaders(ct0) } as RequestInit,
      );
      const data = handleResponse(result);
      if (data?.users?.[0]?.screen_name) return data.users[0].screen_name as string;
      if (Array.isArray(data) && data[0]?.user?.screen_name) return data[0].user.screen_name as string;
      throw new TwitterAPIError(0, "Could not determine current user");
    });
    return this.fetchUser(screenName);
  }

  // ── Media upload ─────────────────────────────────────────────────────

  async uploadMedia(filePath: string): Promise<string> {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    const EXT_TO_MIME: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
    };
    const mimeType = EXT_TO_MIME[extname(filePath).toLowerCase()] ?? "";
    if (!SUPPORTED.has(mimeType)) {
      throw new Error(`Unsupported image format: ${extname(filePath)} (supported: jpeg, png, gif, webp)`);
    }
    const totalBytes = statSync(filePath).size;
    const MAX_SIZE = 5 * 1024 * 1024;
    if (totalBytes > MAX_SIZE) throw new Error(`File too large: ${(totalBytes / 1024 / 1024).toFixed(1)} MB (max 5 MB)`);

    const buf = await Bun.file(filePath).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const base64Data = btoa(binary);

    return withWritePage(async (page) => {
      const ct0 = await getCt0(page);
      const uploadHeaders = baseHeaders(ct0);

      const mediaId = await (page as any).evaluate(
        async (
          b64: string,
          mime: string,
          total: number,
          hdrs: Record<string, string>,
        ): Promise<string> => {
          const url = "https://upload.twitter.com/i/media/upload.json";
          const formHeaders = { ...hdrs, "Content-Type": "application/x-www-form-urlencoded" };

          const initResp = await fetch(url, {
            method: "POST",
            headers: formHeaders,
            body: `command=INIT&total_bytes=${total}&media_type=${encodeURIComponent(mime)}`,
          });
          if (!initResp.ok) throw new Error(`Media INIT failed: HTTP ${initResp.status}`);
          const initJson = await initResp.json() as any;
          const mediaId: string = initJson.media_id_string ?? "";
          if (!mediaId) throw new Error("Media INIT did not return media_id");

          const appendBody = `command=APPEND&media_id=${mediaId}&segment_index=0&media_data=${encodeURIComponent(b64)}`;
          const appendResp = await fetch(url, { method: "POST", headers: formHeaders, body: appendBody });
          if (!appendResp.ok) throw new Error(`Media APPEND failed: HTTP ${appendResp.status}`);

          const finalResp = await fetch(url, {
            method: "POST",
            headers: formHeaders,
            body: `command=FINALIZE&media_id=${mediaId}`,
          });
          if (!finalResp.ok) throw new Error(`Media FINALIZE failed: HTTP ${finalResp.status}`);

          return mediaId;
        },
        base64Data,
        mimeType,
        totalBytes,
        uploadHeaders,
      );

      return mediaId as string;
    });
  }

  // ── Write operations ─────────────────────────────────────────────────

  async createTweet(
    text: string,
    replyToId?: string,
    mediaIds?: string[],
  ): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      const mediaEntities = (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] }));
      const variables: Record<string, unknown> = {
        tweet_text: text,
        media: { media_entities: mediaEntities, possibly_sensitive: false },
        semantic_annotation_ids: [],
        dark_request: false,
      };
      if (replyToId) {
        variables.reply = { in_reply_to_tweet_id: replyToId, exclude_reply_user_ids: [] };
      }
      const data = await gqlPost(page, "CreateTweet", variables, DEFAULT_FEATURES);
      const id: string = deepGet(data, "data", "create_tweet", "tweet_results", "result", "rest_id") ?? "";
      return { success: true, id, url: id ? `https://x.com/i/status/${id}` : undefined };
    });
  }

  async quoteTweet(tweetId: string, text: string, mediaIds?: string[]): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      const mediaEntities = (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] }));
      const variables: Record<string, unknown> = {
        tweet_text: text,
        attachment_url: `https://x.com/i/status/${tweetId}`,
        media: { media_entities: mediaEntities, possibly_sensitive: false },
        semantic_annotation_ids: [],
        dark_request: false,
      };
      const data = await gqlPost(page, "CreateTweet", variables, DEFAULT_FEATURES);
      const id: string = deepGet(data, "data", "create_tweet", "tweet_results", "result", "rest_id") ?? "";
      return { success: true, id, url: id ? `https://x.com/i/status/${id}` : undefined };
    });
  }

  async deleteTweet(tweetId: string): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      await gqlPost(page, "DeleteTweet", { tweet_id: tweetId, dark_request: false });
      return { success: true, id: tweetId };
    });
  }

  async likeTweet(tweetId: string): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      await gqlPost(page, "FavoriteTweet", { tweet_id: tweetId });
      return { success: true, id: tweetId };
    });
  }

  async unlikeTweet(tweetId: string): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      await gqlPost(page, "UnfavoriteTweet", { tweet_id: tweetId, dark_request: false });
      return { success: true, id: tweetId };
    });
  }

  async retweetTweet(tweetId: string): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      await gqlPost(page, "CreateRetweet", { tweet_id: tweetId, dark_request: false });
      return { success: true, id: tweetId };
    });
  }

  async unretweetTweet(tweetId: string): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      await gqlPost(page, "DeleteRetweet", { source_tweet_id: tweetId, dark_request: false });
      return { success: true, id: tweetId };
    });
  }

  async bookmarkTweet(tweetId: string): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      await gqlPost(page, "CreateBookmark", { tweet_id: tweetId });
      return { success: true, id: tweetId };
    });
  }

  async unbookmarkTweet(tweetId: string): Promise<GqlWriteResult> {
    return withWritePage(async (page) => {
      await gqlPost(page, "DeleteBookmark", { tweet_id: tweetId });
      return { success: true, id: tweetId };
    });
  }

  async followUser(screenName: string): Promise<GqlWriteResult> {
    const name = screenName.replace(/^@/, "");
    const user = await this.fetchUser(name);
    return withWritePage(async (page) => {
      const ct0 = await getCt0(page);
      await (page as any).evaluate(
        async (url: string, body: string, headers: Record<string, string>) => {
          await fetch(url, { method: "POST", headers, body });
        },
        "https://x.com/i/api/1.1/friendships/create.json",
        `user_id=${user.id}&include_profile_interstitial_type=1`,
        {
          Authorization: `Bearer ${BEARER_TOKEN}`,
          "X-Csrf-Token": ct0,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Twitter-Active-User": "yes",
          "X-Twitter-Auth-Type": "OAuth2Session",
        },
      );
      return { success: true };
    });
  }

  async unfollowUser(screenName: string): Promise<GqlWriteResult> {
    const name = screenName.replace(/^@/, "");
    const user = await this.fetchUser(name);
    return withWritePage(async (page) => {
      const ct0 = await getCt0(page);
      await (page as any).evaluate(
        async (url: string, body: string, headers: Record<string, string>) => {
          await fetch(url, { method: "POST", headers, body });
        },
        "https://x.com/i/api/1.1/friendships/destroy.json",
        `user_id=${user.id}&include_profile_interstitial_type=1`,
        {
          Authorization: `Bearer ${BEARER_TOKEN}`,
          "X-Csrf-Token": ct0,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Twitter-Active-User": "yes",
          "X-Twitter-Auth-Type": "OAuth2Session",
        },
      );
      return { success: true };
    });
  }
}
