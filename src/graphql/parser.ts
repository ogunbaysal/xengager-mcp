import type { GqlTweet, GqlUserProfile, GqlMedia, GqlPaginated, GqlNotification } from "./types.js";

export interface GqlArticle {
  title: string | null;
  text: string | null;
}

// ── Utility ───────────────────────────────────────────────────────────────

export function deepGet(obj: unknown, ...keys: (string | number)[]): any {
  let current: any = obj;
  for (const key of keys) {
    if (current == null) return undefined;
    if (typeof key === "number") {
      if (!Array.isArray(current) || key < 0 || key >= current.length) return undefined;
      current = current[key];
    } else {
      if (typeof current !== "object") return undefined;
      current = current[key];
    }
  }
  return current;
}

function parseIntSafe(value: unknown, fallback = 0): number {
  try {
    const text = String(value).replace(",", "").trim();
    if (!text) return fallback;
    const n = parseInt(text, 10);
    return isNaN(n) ? fallback : n;
  } catch {
    return fallback;
  }
}

// ── Article parsing ───────────────────────────────────────────────────────

function renderArticleBlock(block: any, entityMap: Record<string, any>): string {
  const text: string = block.text ?? "";
  if (!text) return "";
  const ranges: Array<{ offset: number; length: number; url: string }> = [];
  for (const er of block.entityRanges ?? []) {
    const entity = entityMap[String(er.key)];
    if (!entity || String(entity.type ?? "").toUpperCase() !== "LINK") continue;
    const url: string = entity?.data?.url ?? "";
    if (url && typeof er.offset === "number" && typeof er.length === "number" && er.length > 0) {
      ranges.push({ offset: er.offset, length: er.length, url });
    }
  }
  if (!ranges.length) return text;
  let rendered = text;
  for (const { offset, length, url } of ranges.sort((a, b) => b.offset - a.offset)) {
    if (offset < 0 || offset + length > rendered.length) continue;
    const label = rendered.slice(offset, offset + length)
      .replace(/\[/g, "\\[").replace(/\]/g, "\\]");
    const safeUrl = url.replace(/\)/g, "%29");
    rendered = `${rendered.slice(0, offset)}[${label}](${safeUrl})${rendered.slice(offset + length)}`;
  }
  return rendered;
}

export function parseArticle(tweetData: any): GqlArticle | null {
  const result = deepGet(tweetData, "article", "article_results", "result");
  if (!result) return null;
  const title: string | null = result.title ?? null;
  const contentState = result.content_state ?? {};
  const blocks: any[] = contentState.blocks ?? [];
  if (!blocks.length) return { title, text: null };

  const entityMap: Record<string, any> = contentState.entityMap ?? {};
  const parts: string[] = [];
  let orderedCounter = 0;

  for (const block of blocks) {
    const type: string = block.type ?? "unstyled";
    if (type === "atomic") { orderedCounter = 0; continue; }
    const text = renderArticleBlock(block, entityMap);
    if (!text) continue;
    if (type !== "ordered-list-item") orderedCounter = 0;

    if (type === "header-one") parts.push(`# ${text}`);
    else if (type === "header-two") parts.push(`## ${text}`);
    else if (type === "header-three") parts.push(`### ${text}`);
    else if (type === "blockquote") parts.push(`> ${text}`);
    else if (type === "unordered-list-item") parts.push(`- ${text}`);
    else if (type === "ordered-list-item") { orderedCounter++; parts.push(`${orderedCounter}. ${text}`); }
    else if (type === "code-block") parts.push(`\`\`\`\n${text}\n\`\`\``);
    else parts.push(text);
  }

  return { title, text: parts.length ? parts.join("\n\n") : null };
}

// ── User parsing ──────────────────────────────────────────────────────────

export function parseUserResult(data: any): GqlUserProfile | null {
  if (!data || data.__typename === "UserUnavailable") return null;
  if (!data.rest_id) return null;

  const legacy = data.legacy ?? {};
  const core = data.core ?? {};
  const avatar = data.avatar ?? {};
  const locationObj = data.location ?? {};

  return {
    id: data.rest_id,
    name: core.name ?? legacy.name ?? "",
    screenName: core.screen_name ?? legacy.screen_name ?? "",
    bio: legacy.description ?? "",
    location: locationObj.location ?? legacy.location ?? "",
    url: deepGet(legacy, "entities", "url", "urls", 0, "expanded_url") ?? "",
    followersCount: parseIntSafe(legacy.followers_count),
    followingCount: parseIntSafe(legacy.friends_count),
    tweetsCount: parseIntSafe(legacy.statuses_count),
    likesCount: parseIntSafe(legacy.favourites_count),
    verified: Boolean(data.is_blue_verified ?? legacy.verified ?? false),
    profileImageUrl: avatar.image_url ?? legacy.profile_image_url_https ?? "",
    createdAt: core.created_at ?? legacy.created_at ?? "",
  };
}

// ── Media extraction ──────────────────────────────────────────────────────

function extractMedia(legacy: any): GqlMedia[] {
  const mediaItems: any[] = deepGet(legacy, "extended_entities", "media") ?? [];
  const result: GqlMedia[] = [];

  for (const item of mediaItems) {
    const type: string = item.type ?? "";
    if (type === "photo") {
      result.push({
        type: "photo",
        url: item.media_url_https ?? "",
        width: deepGet(item, "original_info", "width"),
        height: deepGet(item, "original_info", "height"),
      });
    } else if (type === "video" || type === "animated_gif") {
      const variants: any[] = deepGet(item, "video_info", "variants") ?? [];
      const mp4 = variants
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      result.push({
        type: type as "video" | "animated_gif",
        url: mp4[0]?.url ?? item.media_url_https ?? "",
        width: deepGet(item, "original_info", "width"),
        height: deepGet(item, "original_info", "height"),
      });
    }
  }

  return result;
}

// ── Tweet parsing ─────────────────────────────────────────────────────────

function unwrapVisibility(result: any): { data: any; isSubscriberOnly: boolean } {
  if (result?.__typename === "TweetWithVisibilityResults" && result.tweet) {
    return { data: result.tweet, isSubscriberOnly: Boolean(result.tweetInterstitial) };
  }
  return { data: result, isSubscriberOnly: false };
}

export function parseTweetResult(result: any, depth = 0): GqlTweet | null {
  if (depth > 2) return null;

  const { data: tweetData, isSubscriberOnly } = unwrapVisibility(result);
  if (!tweetData || tweetData.__typename === "TweetTombstone") return null;

  const legacy = tweetData.legacy;
  const core = tweetData.core;
  if (!legacy || typeof legacy !== "object" || !core || typeof core !== "object") return null;

  const userResult = deepGet(core, "user_results", "result") ?? {};
  const userLegacy = userResult.legacy ?? {};
  const userCore = userResult.core ?? {};

  const isRetweet = Boolean(deepGet(legacy, "retweeted_status_result", "result"));
  let actualData = tweetData;
  let actualLegacy = legacy;
  let actualUserResult = userResult;
  let actualUserLegacy = userLegacy;
  let retweetedBy: string | undefined;
  let rtIsSubscriberOnly = false;

  if (isRetweet) {
    const rtResult = deepGet(legacy, "retweeted_status_result", "result");
    const { data: rtData, isSubscriberOnly: rtSub } = unwrapVisibility(rtResult);
    rtIsSubscriberOnly = rtSub;
    const rtLegacy = rtData?.legacy;
    const rtCore = rtData?.core;
    if (rtLegacy && rtCore) {
      actualData = rtData;
      actualLegacy = rtLegacy;
      actualUserResult = deepGet(rtCore, "user_results", "result") ?? {};
      actualUserLegacy = actualUserResult.legacy ?? {};
    }
    retweetedBy = userCore.screen_name ?? userLegacy.screen_name;
  }

  const actualUserCore = actualUserResult.core ?? {};
  const actualAvatar = actualUserResult.avatar ?? {};

  const author = {
    id: actualUserResult.rest_id ?? "",
    name: actualUserCore.name ?? actualUserLegacy.name ?? "",
    screenName: actualUserCore.screen_name ?? actualUserLegacy.screen_name ?? "",
    profileImageUrl: actualAvatar.image_url ?? actualUserLegacy.profile_image_url_https ?? "",
    verified: Boolean(actualUserResult.is_blue_verified ?? actualUserLegacy.verified ?? false),
  };

  const urls: string[] = (deepGet(actualLegacy, "entities", "urls") ?? [])
    .map((u: any) => u.expanded_url ?? "")
    .filter(Boolean);

  const quotedResult = deepGet(actualData, "quoted_status_result", "result");
  const quotedTweet = quotedResult ? parseTweetResult(quotedResult, depth + 1) : undefined;

  const noteText = deepGet(actualData, "note_tweet", "note_tweet_results", "result", "text");

  return {
    id: actualData.rest_id ?? "",
    text: noteText ?? actualLegacy.full_text ?? "",
    lang: actualLegacy.lang ?? "",
    author,
    metrics: {
      likes: parseIntSafe(actualLegacy.favorite_count),
      retweets: parseIntSafe(actualLegacy.retweet_count),
      replies: parseIntSafe(actualLegacy.reply_count),
      quotes: parseIntSafe(actualLegacy.quote_count),
      views: parseIntSafe(deepGet(actualData, "views", "count")),
      bookmarks: parseIntSafe(actualLegacy.bookmark_count),
    },
    media: extractMedia(actualLegacy),
    urls,
    createdAt: actualLegacy.created_at ?? "",
    isRetweet,
    retweetedBy,
    quotedTweet: quotedTweet ?? undefined,
    articleTitle: deepGet(actualData, "article", "article_results", "result", "title"),
    articleText: parseArticle(actualData)?.text ?? undefined,
    isSubscriberOnly: isRetweet ? (isSubscriberOnly || rtIsSubscriberOnly) : isSubscriberOnly,
    isPromoted: false,
  };
}

// ── Timeline response parsing ─────────────────────────────────────────────

export function parseTimelineResponse(
  data: unknown,
  getInstructions: (d: unknown) => any,
): GqlPaginated<GqlTweet> {
  const instructions = getInstructions(data);
  if (!Array.isArray(instructions)) return { items: [], nextCursor: null };

  const items: GqlTweet[] = [];
  let nextCursor: string | null = null;

  for (const instruction of instructions) {
    const entries: any[] = instruction.entries ?? instruction.moduleItems ?? [];

    for (const entry of entries) {
      const content = entry.content ?? {};

      // Cursor
      if (content.cursorType === "Bottom" && content.value) {
        nextCursor = content.value;
      }
      if (content.entryType === "TimelineTimelineCursor" && content.cursorType === "Bottom") {
        nextCursor = content.value;
      }

      // Direct item
      const directResult = deepGet(content, "itemContent", "tweet_results", "result");
      if (directResult) {
        const tweet = parseTweetResult(directResult);
        if (tweet) {
          tweet.isPromoted = Boolean(
            String(entry.entryId ?? "").startsWith("promoted-") ||
            deepGet(content, "itemContent", "promotedMetadata"),
          );
          items.push(tweet);
        }
      }

      // Module items (nested)
      const nestedItems: any[] = content.items ?? [];
      for (const nested of nestedItems) {
        const nestedResult = deepGet(nested, "item", "itemContent", "tweet_results", "result");
        if (nestedResult) {
          const tweet = parseTweetResult(nestedResult);
          if (tweet) {
            tweet.isPromoted = Boolean(
              String(deepGet(nested, "entryId") ?? "").startsWith("promoted-") ||
              deepGet(nested, "item", "itemContent", "promotedMetadata"),
            );
            items.push(tweet);
          }
        }
      }
    }
  }

  return { items, nextCursor };
}

// ── Notification response parsing ─────────────────────────────────────────

export function parseNotificationsResponse(data: unknown): GqlPaginated<GqlNotification> {
  const instructions = deepGet(
    data,
    "data",
    "viewer_v2",
    "user_results",
    "result",
    "notification_timeline",
    "timeline",
    "instructions",
  );
  if (!Array.isArray(instructions)) return { items: [], nextCursor: null };

  const items: GqlNotification[] = [];
  let nextCursor: string | null = null;

  for (const instruction of instructions) {
    const entries: any[] = instruction.entries ?? [];
    for (const entry of entries) {
      const content = entry.content ?? {};
      if (content.entryType === "TimelineTimelineCursor" && content.cursorType === "Bottom") {
        nextCursor = content.value ?? null;
        continue;
      }

      const notification = deepGet(content, "itemContent");
      if (!notification || notification.itemType !== "TimelineNotification") continue;

      const actors: GqlUserProfile[] = [];
      const templateUsers: any[] = deepGet(notification, "template", "from_users") ?? [];
      for (const ref of templateUsers) {
        const user = parseUserResult(deepGet(ref, "user_results", "result"));
        if (user) actors.push(user);
      }

      if (actors.length === 0) {
        const richEntities: any[] = deepGet(notification, "rich_message", "entities") ?? [];
        for (const entity of richEntities) {
          const user = parseUserResult(deepGet(entity, "ref", "user_results", "result"));
          if (user) actors.push(user);
        }
      }

      const tweetResult = deepGet(notification, "tweet_results", "result");
      const tweet = tweetResult ? parseTweetResult(tweetResult) ?? undefined : undefined;

      const url = deepGet(notification, "notification_url", "url") ?? (tweet?.id ? `https://x.com/i/status/${tweet.id}` : "");
      items.push({
        id: notification.id ?? String(entry.entryId ?? ""),
        type: notification.notification_icon ?? deepGet(notification, "template", "__typename") ?? "notification",
        text: deepGet(notification, "rich_message", "text") ?? "",
        url,
        timestamp: notification.timestamp_ms ?? "",
        actors,
        tweet,
      });
    }
  }

  return { items, nextCursor };
}

// ── User list response parsing ────────────────────────────────────────────

export function parseUserListResponse(
  data: unknown,
  getInstructions: (d: unknown) => any,
): GqlPaginated<GqlUserProfile> {
  const instructions = getInstructions(data);
  if (!Array.isArray(instructions)) return { items: [], nextCursor: null };

  const items: GqlUserProfile[] = [];
  let nextCursor: string | null = null;

  for (const instruction of instructions) {
    const entries: any[] = instruction.entries ?? [];

    for (const entry of entries) {
      const content = entry.content ?? {};

      if (content.entryType === "TimelineTimelineCursor" && content.cursorType === "Bottom") {
        nextCursor = content.value;
        continue;
      }

      const userResult = deepGet(content, "itemContent", "user_results", "result");
      if (userResult) {
        const user = parseUserResult(userResult);
        if (user) items.push(user);
      }
    }
  }

  return { items, nextCursor };
}
