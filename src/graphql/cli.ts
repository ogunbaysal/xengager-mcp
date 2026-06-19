import { closeBrowser } from "../browser.js";
import { TwitterGraphQLClient, TwitterAuthError, TwitterRateLimitError, TwitterAPIError } from "./client.js";
import { saveTweetCache, resolveCachedTweet } from "./cache.js";
import type { GqlTweet, GqlUserProfile, GqlNotification } from "./types.js";

const client = new TwitterGraphQLClient();

// ── Helpers ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { args: string[]; flags: Record<string, string | boolean | string[]> } {
  const args: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        const existing = flags[key];
        if (Array.isArray(existing)) {
          existing.push(next);
        } else if (typeof existing === "string") {
          flags[key] = [existing, next];
        } else {
          flags[key] = next;
        }
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

function normalizeTweetId(value: string): string {
  const match = value.match(/\/status\/(\d+)/);
  if (match) return match[1]!;
  const clean = (value.split("?")[0]!.split("#")[0]!.split("/").pop()) ?? value;
  if (!/^\d+$/.test(clean)) throw new Error(`Invalid tweet ID or URL: ${value}`);
  return clean;
}

function printTweets(tweets: GqlTweet[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(tweets, null, 2));
    return;
  }
  for (const t of tweets) {
    const prefix = t.isRetweet ? `RT @${t.retweetedBy} → ` : "";
    const verified = t.author.verified ? " ✓" : "";
    const media = t.media.length ? ` [${t.media.map((m) => m.type).join(",")}]` : "";
    const metrics = `❤ ${t.metrics.likes}  RT ${t.metrics.retweets}  💬 ${t.metrics.replies}  👁 ${t.metrics.views}`;
    console.log(`\n@${t.author.screenName}${verified} · ${t.createdAt}`);
    console.log(`${prefix}${t.text}${media}`);
    console.log(metrics);
    if (t.quotedTweet) {
      console.log(`  ↩ @${t.quotedTweet.author.screenName}: ${t.quotedTweet.text.slice(0, 100)}`);
    }
  }
}

function printUsers(users: GqlUserProfile[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(users, null, 2));
    return;
  }
  for (const u of users) {
    const v = u.verified ? " ✓" : "";
    const followTag = u.isFollowing === true ? " 🔵 following" : u.isFollowing === false ? " ⚪ not following" : "";
    console.log(`\n@${u.screenName}${v} — ${u.name}${followTag}`);
    if (u.bio) console.log(`  ${u.bio}`);
    console.log(`  Followers: ${u.followersCount}  Following: ${u.followingCount}  Tweets: ${u.tweetsCount}`);
    if (u.location) console.log(`  📍 ${u.location}`);
  }
}

function printNotifications(notifications: GqlNotification[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(notifications, null, 2));
    return;
  }
  for (const n of notifications) {
    const actors = n.actors.map((a) => `@${a.screenName}`).filter(Boolean).join(", ");
    const actorPrefix = actors ? `${actors}: ` : "";
    console.log(`\n${n.timestamp} · ${n.type}`);
    console.log(`${actorPrefix}${n.text}`);
    if (n.url) console.log(n.url);
    if (n.tweet) console.log(`Tweet: @${n.tweet.author.screenName}: ${n.tweet.text.slice(0, 140)}`);
  }
}

function printResult(result: object, asJson: boolean, label: string): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`✅ ${label}`);
    console.log(JSON.stringify(result, null, 2));
  }
}

// ── Commands ──────────────────────────────────────────────────────────────

type Flags = Record<string, string | boolean | string[]>;

function getImages(flags: Flags): string[] {
  const v = flags.image;
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") return [v];
  return [];
}

async function cmdFeed(args: string[], flags: Flags): Promise<void> {
  const type = (flags.type as string) ?? "for-you";
  const count = parseInt((flags.count as string) ?? "20", 10);
  const cursor = flags.cursor as string | undefined;
  const asJson = Boolean(flags.json);

  console.error(`Fetching ${type === "following" ? "following" : "home"} feed (${count})...`);
  const result =
    type === "following"
      ? await client.fetchFollowingFeed(count, cursor)
      : await client.fetchHomeTimeline(count, cursor);

  void saveTweetCache(result.items);
  printTweets(result.items, asJson);
  if (result.nextCursor) console.error(`\nNext cursor: ${result.nextCursor}`);
}

async function cmdNotifications(args: string[], flags: Flags): Promise<void> {
  const count = parseInt((flags.count as string) ?? "20", 10);
  const cursor = flags.cursor as string | undefined;
  const type = ((flags.type as string) ?? "All") as "All" | "Mentions" | "Verified";
  const asJson = Boolean(flags.json);

  console.error(`Fetching notifications (${type}, ${count})...`);
  const result = await client.fetchNotifications(count, cursor, type);
  printNotifications(result.items, asJson);
  if (result.nextCursor) console.error(`\nNext cursor: ${result.nextCursor}`);
}

async function cmdSearch(args: string[], flags: Flags): Promise<void> {
  const query = args[0];
  if (!query) throw new Error("Usage: graphql search <query> [--type Top|Latest|Photos|Videos]");
  const count = parseInt((flags.count as string) ?? "20", 10);
  const product = ((flags.type as string) ?? "Top") as "Top" | "Latest" | "Photos" | "Videos";
  const asJson = Boolean(flags.json);

  console.error(`Searching "${query}" (${product}, ${count})...`);
  const result = await client.fetchSearch(query, count, product);
  void saveTweetCache(result.items);
  printTweets(result.items, asJson);
  if (result.nextCursor) console.error(`\nNext cursor: ${result.nextCursor}`);
}

async function cmdUser(args: string[], flags: Flags): Promise<void> {
  const handle = args[0];
  if (!handle) throw new Error("Usage: graphql user <handle>");
  const asJson = Boolean(flags.json);
  console.error(`Fetching @${handle}...`);
  const user = await client.fetchUser(handle);
  if (asJson) {
    console.log(JSON.stringify(user, null, 2));
  } else {
    printUsers([user], false);
  }
}

async function cmdUserPosts(args: string[], flags: Flags): Promise<void> {
  const handle = args[0];
  if (!handle) throw new Error("Usage: graphql user-posts <handle>");
  const count = parseInt((flags.count as string) ?? "20", 10);
  const asJson = Boolean(flags.json);
  console.error(`Fetching @${handle}'s tweets...`);
  const user = await client.fetchUser(handle);
  const result = await client.fetchUserTweets(user.id, count);
  void saveTweetCache(result.items);
  printTweets(result.items, asJson);
  if (result.nextCursor) console.error(`\nNext cursor: ${result.nextCursor}`);
}

async function cmdLikes(args: string[], flags: Flags): Promise<void> {
  const handle = args[0];
  if (!handle) throw new Error("Usage: graphql likes <handle>");
  const count = parseInt((flags.count as string) ?? "20", 10);
  const asJson = Boolean(flags.json);
  console.error(`Fetching @${handle}'s likes...`);
  const user = await client.fetchUser(handle);
  const result = await client.fetchUserLikes(user.id, count);
  void saveTweetCache(result.items);
  printTweets(result.items, asJson);
}

async function cmdTweet(args: string[], flags: Flags): Promise<void> {
  const id = args[0];
  if (!id) throw new Error("Usage: graphql tweet <id|url>");
  const count = parseInt((flags.count as string) ?? "20", 10);
  const asJson = Boolean(flags.json);
  const tweetId = normalizeTweetId(id);
  console.error(`Fetching tweet ${tweetId}...`);
  const result = await client.fetchTweetDetail(tweetId, count);
  void saveTweetCache(result.items);
  printTweets(result.items, asJson);
}

async function cmdGet(args: string[], flags: Flags): Promise<void> {
  const id = args[0];
  if (!id) throw new Error("Usage: graphql get <id|url>");
  const asJson = Boolean(flags.json);
  const tweetId = normalizeTweetId(id);
  console.error(`Fetching tweet ${tweetId}...`);
  const tweet = await client.fetchTweetById(tweetId);
  printTweets([tweet], asJson);
}

async function cmdArticle(args: string[], flags: Flags): Promise<void> {
  const id = args[0];
  if (!id) throw new Error("Usage: graphql article <id|url>");
  const asJson = Boolean(flags.json);
  const tweetId = normalizeTweetId(id);
  console.error(`Fetching article ${tweetId}...`);
  const tweet = await client.fetchArticle(tweetId);
  if (asJson) {
    console.log(JSON.stringify(tweet, null, 2));
  } else {
    if (tweet.articleTitle) console.log(`# ${tweet.articleTitle}\n`);
    if (tweet.articleText) console.log(tweet.articleText);
    else printTweets([tweet], false);
  }
}

async function cmdShow(args: string[], flags: Flags): Promise<void> {
  const indexStr = args[0];
  if (!indexStr || !/^\d+$/.test(indexStr)) throw new Error("Usage: graphql show <N>");
  const index = parseInt(indexStr, 10);
  const count = parseInt((flags.count as string) ?? "20", 10);
  const asJson = Boolean(flags.json);

  const { id, cacheSize } = await resolveCachedTweet(index);
  if (!id) {
    if (cacheSize === 0) {
      throw new Error("No cached results. Run feed, search, bookmarks, or another list command first.");
    }
    throw new Error(`Index ${index} out of range (cache has ${cacheSize} tweets).`);
  }

  console.error(`Fetching tweet #${index} (${id})...`);
  const result = await client.fetchTweetDetail(id, count);
  printTweets(result.items, asJson);
}

async function cmdBookmarks(args: string[], flags: Flags): Promise<void> {
  const sub = args[0];
  const count = parseInt((flags.count as string) ?? "50", 10);
  const asJson = Boolean(flags.json);

  if (sub === "folders") {
    const folderId = args[1];
    if (folderId) {
      console.error(`Fetching bookmark folder ${folderId}...`);
      const result = await client.fetchBookmarkFolderTimeline(folderId, count);
      void saveTweetCache(result.items);
      printTweets(result.items, asJson);
    } else {
      console.error("Fetching bookmark folders...");
      const folders = await client.fetchBookmarkFolders();
      if (asJson) {
        console.log(JSON.stringify(folders, null, 2));
      } else {
        for (const f of folders) console.log(`${f.id}  ${f.name}`);
      }
    }
  } else {
    console.error(`Fetching bookmarks (${count})...`);
    const result = await client.fetchBookmarks(count);
    void saveTweetCache(result.items);
    printTweets(result.items, asJson);
  }
}

async function cmdList(args: string[], flags: Flags): Promise<void> {
  const listId = args[0];
  if (!listId) throw new Error("Usage: graphql list <list-id>");
  const count = parseInt((flags.count as string) ?? "20", 10);
  const cursor = flags.cursor as string | undefined;
  const asJson = Boolean(flags.json);
  console.error(`Fetching list ${listId}...`);
  const result = await client.fetchListTimeline(listId, count, cursor);
  void saveTweetCache(result.items);
  printTweets(result.items, asJson);
  if (result.nextCursor) console.error(`\nNext cursor: ${result.nextCursor}`);
}

async function cmdFollowers(args: string[], flags: Flags): Promise<void> {
  const handle = args[0];
  if (!handle) throw new Error("Usage: graphql followers <handle>");
  const count = parseInt((flags.count as string) ?? "20", 10);
  const asJson = Boolean(flags.json);
  console.error(`Fetching followers of @${handle}...`);
  const user = await client.fetchUser(handle);
  const result = await client.fetchFollowers(user.id, count);
  printUsers(result.items, asJson);
  if (result.nextCursor) console.error(`\nNext cursor: ${result.nextCursor}`);
}

async function cmdFollowing(args: string[], flags: Flags): Promise<void> {
  const handle = args[0];
  if (!handle) throw new Error("Usage: graphql following <handle>");
  const count = parseInt((flags.count as string) ?? "20", 10);
  const asJson = Boolean(flags.json);
  console.error(`Fetching following of @${handle}...`);
  const user = await client.fetchUser(handle);
  const result = await client.fetchFollowing(user.id, count);
  printUsers(result.items, asJson);
  if (result.nextCursor) console.error(`\nNext cursor: ${result.nextCursor}`);
}

async function cmdWhoami(args: string[], flags: Flags): Promise<void> {
  const asJson = Boolean(flags.json);
  console.error("Fetching current user...");
  const user = await client.fetchMe();
  if (asJson) {
    console.log(JSON.stringify(user, null, 2));
  } else {
    printUsers([user], false);
  }
}

async function uploadImages(images: string[]): Promise<string[]> {
  const mediaIds: string[] = [];
  for (let i = 0; i < images.length; i++) {
    console.error(`Uploading image ${i + 1}/${images.length}: ${images[i]!}...`);
    mediaIds.push(await client.uploadMedia(images[i]!));
  }
  return mediaIds;
}

async function cmdPost(args: string[], flags: Flags): Promise<void> {
  const text = args[0];
  if (!text) throw new Error("Usage: graphql post <text> [--reply-to <id>] [--image <path>]");
  const replyTo = flags["reply-to"] as string | undefined;
  const replyId = replyTo ? normalizeTweetId(replyTo) : undefined;
  const images = getImages(flags);
  const asJson = Boolean(flags.json);
  console.error(replyId ? `Replying to ${replyId}...` : "Posting tweet...");
  const mediaIds = await uploadImages(images);
  const result = await client.createTweet(text, replyId, mediaIds.length ? mediaIds : undefined);
  printResult(result, asJson, `Posted: ${result.url}`);
}

async function cmdReply(args: string[], flags: Flags): Promise<void> {
  const [id, ...textParts] = args;
  const text = textParts.join(" ");
  if (!id || !text) throw new Error("Usage: graphql reply <id|url> <text> [--image <path>]");
  const tweetId = normalizeTweetId(id);
  const images = getImages(flags);
  const asJson = Boolean(flags.json);
  console.error(`Replying to ${tweetId}...`);
  const mediaIds = await uploadImages(images);
  const result = await client.createTweet(text, tweetId, mediaIds.length ? mediaIds : undefined);
  printResult(result, asJson, `Reply posted: ${result.url}`);
}

async function cmdQuote(args: string[], flags: Flags): Promise<void> {
  const [id, ...textParts] = args;
  const text = textParts.join(" ");
  if (!id || !text) throw new Error("Usage: graphql quote <id|url> <text> [--image <path>]");
  const tweetId = normalizeTweetId(id);
  const images = getImages(flags);
  const asJson = Boolean(flags.json);
  console.error(`Quoting tweet ${tweetId}...`);
  const mediaIds = await uploadImages(images);
  const result = await client.quoteTweet(tweetId, text, mediaIds.length ? mediaIds : undefined);
  printResult(result, asJson, `Quote posted: ${result.url}`);
}

async function cmdDelete(args: string[], flags: Flags): Promise<void> {
  const id = args[0];
  if (!id) throw new Error("Usage: graphql delete <id|url>");
  const tweetId = normalizeTweetId(id);
  const asJson = Boolean(flags.json);
  console.error(`Deleting tweet ${tweetId}...`);
  const result = await client.deleteTweet(tweetId);
  printResult(result, asJson, `Deleted tweet ${tweetId}`);
}

function makeSingleAction(
  action: (id: string) => Promise<any>,
  usage: string,
  label: (id: string) => string,
) {
  return async (args: string[], flags: Flags) => {
    const id = args[0];
    if (!id) throw new Error(`Usage: graphql ${usage}`);
    const tweetId = normalizeTweetId(id);
    const asJson = Boolean(flags.json);
    console.error(label(tweetId));
    const result = await action(tweetId);
    printResult(result, asJson, "Done");
  };
}

async function cmdFollow(args: string[], flags: Flags): Promise<void> {
  const handle = args[0];
  if (!handle) throw new Error("Usage: graphql follow <handle>");
  const asJson = Boolean(flags.json);
  console.error(`Following @${handle}...`);
  const result = await client.followUser(handle);
  printResult(result, asJson, `Now following @${handle}`);
}

async function cmdUnfollow(args: string[], flags: Flags): Promise<void> {
  const handle = args[0];
  if (!handle) throw new Error("Usage: graphql unfollow <handle>");
  const asJson = Boolean(flags.json);
  console.error(`Unfollowing @${handle}...`);
  const result = await client.unfollowUser(handle);
  printResult(result, asJson, `Unfollowed @${handle}`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────

const COMMANDS: Record<string, (args: string[], flags: Flags) => Promise<void>> = {
  feed: cmdFeed,
  notifications: cmdNotifications,
  search: cmdSearch,
  user: cmdUser,
  "user-posts": cmdUserPosts,
  likes: cmdLikes,
  tweet: cmdTweet,
  get: cmdGet,
  article: cmdArticle,
  show: cmdShow,
  bookmarks: cmdBookmarks,
  list: cmdList,
  followers: cmdFollowers,
  following: cmdFollowing,
  whoami: cmdWhoami,
  post: cmdPost,
  reply: cmdReply,
  quote: cmdQuote,
  delete: cmdDelete,
  like: makeSingleAction((id) => client.likeTweet(id), "like <id>", (id) => `Liking ${id}...`),
  unlike: makeSingleAction((id) => client.unlikeTweet(id), "unlike <id>", (id) => `Unliking ${id}...`),
  retweet: makeSingleAction((id) => client.retweetTweet(id), "retweet <id>", (id) => `Retweeting ${id}...`),
  unretweet: makeSingleAction((id) => client.unretweetTweet(id), "unretweet <id>", (id) => `Unretweeting ${id}...`),
  bookmark: makeSingleAction((id) => client.bookmarkTweet(id), "bookmark <id>", (id) => `Bookmarking ${id}...`),
  unbookmark: makeSingleAction((id) => client.unbookmarkTweet(id), "unbookmark <id>", (id) => `Removing bookmark ${id}...`),
  follow: cmdFollow,
  unfollow: cmdUnfollow,
};

function printHelp(): void {
  console.log(`
Usage: bun graphql <command> [args] [--count N] [--cursor VALUE] [--json]

Read commands:
  feed                         Home timeline (For You)
  feed --type following        Following (chronological)
  notifications                Notifications
  notifications --type Mentions Notifications tab: All|Mentions|Verified
  search <query>               Search tweets
  search <query> --type Latest Search tab: Top|Latest|Photos|Videos
  user <handle>                User profile
  user-posts <handle>          User tweets
  likes <handle>               User likes
  tweet <id|url>               Tweet detail + replies
  get <id|url>                 Single tweet by ID
  article <id|url>             Twitter Article full text
  show <N>                     Tweet #N from last list result
  bookmarks                    Bookmarks
  bookmarks folders            List bookmark folders
  bookmarks folders <id>       Tweets in bookmark folder
  list <list-id>               List timeline
  followers <handle>           Followers
  following <handle>           Following
  whoami                       Current user

Write commands:
  post <text>                  Post a tweet
  post <text> --reply-to <id> Reply to a tweet
  post <text> --image <path>  Post with image (up to 4, repeatable)
  reply <id|url> <text>        Reply to a tweet
  quote <id|url> <text>        Quote-tweet
  delete <id|url>              Delete a tweet
  like <id|url>                Like a tweet
  unlike <id|url>              Unlike a tweet
  retweet <id|url>             Retweet
  unretweet <id|url>           Undo retweet
  bookmark <id|url>            Bookmark
  unbookmark <id|url>          Remove bookmark
  follow <handle>              Follow a user
  unfollow <handle>            Unfollow a user

Flags:
  --count N                    Max items to fetch (default: 20)
  --cursor VALUE               Pagination cursor
  --type VALUE                 Sub-type (feed: for-you|following; search: Top|Latest|Photos|Videos)
  --json                       Output raw JSON
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { args, flags } = parseArgs(argv);
  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === "help" || flags.help) {
    printHelp();
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}\nRun "bun graphql help" for usage.`);
    process.exit(1);
  }

  try {
    await handler(rest, flags);
  } catch (err) {
    if (err instanceof TwitterAuthError) {
      console.error(`Auth error: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof TwitterRateLimitError) {
      console.error(`Rate limited: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof TwitterAPIError) {
      console.error(`API error [${err.status}]: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await closeBrowser();
  }
}

main();
