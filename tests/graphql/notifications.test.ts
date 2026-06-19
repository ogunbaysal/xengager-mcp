import { describe, test, expect, mock, beforeEach } from "bun:test";

let mockEvaluateResponse: any = null;
let lastEvaluateUrl: string | null = null;
let lastEvaluateInit: any = null;

const mockPage = {
  cookies: async () => [{ name: "ct0", value: "test-ct0" }],
  evaluate: async (_fn: Function, ...args: any[]) => {
    if (args.length >= 1) lastEvaluateUrl = args[0];
    if (args.length >= 2) lastEvaluateInit = args[1];
    return mockEvaluateResponse;
  },
};

mock.module("../../src/browser.js", () => ({
  withReadPage: async (fn: (page: any) => any) => fn(mockPage),
  withWritePage: async (fn: (page: any) => any) => fn(mockPage),
}));

const { parseNotificationsResponse } = await import("../../src/graphql/parser.js");
const { TwitterGraphQLClient } = await import("../../src/graphql/client.js");

function notificationFixture() {
  return {
    data: {
      viewer_v2: {
        user_results: {
          result: {
            notification_timeline: {
              timeline: {
                instructions: [
                  { type: "TimelineClearCache" },
                  {
                    entries: [
                      {
                        entryId: "cursor-top-1",
                        content: {
                          entryType: "TimelineTimelineCursor",
                          cursorType: "Top",
                          value: "top-cursor",
                        },
                      },
                      {
                        entryId: "notification-n1",
                        sortIndex: "100",
                        content: {
                          itemContent: {
                            __typename: "TimelineNotification",
                            itemType: "TimelineNotification",
                            id: "n1",
                            notification_icon: "person_icon",
                            notification_url: { url: "https://twitter.com/alice" },
                            timestamp_ms: "2026-06-16T11:42:32.647Z",
                            rich_message: { text: "Alice followed you" },
                            template: {
                              from_users: [
                                {
                                  user_results: {
                                    result: {
                                      rest_id: "u1",
                                      is_blue_verified: true,
                                      avatar: { image_url: "https://img/alice.jpg" },
                                      core: { name: "Alice", screen_name: "alice", created_at: "Mon Jan 01 00:00:00 +0000 2020" },
                                      legacy: {
                                        description: "bio",
                                        location: "Earth",
                                        followers_count: 10,
                                        friends_count: 5,
                                        statuses_count: 3,
                                        favourites_count: 2,
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                      {
                        entryId: "cursor-bottom-1",
                        content: {
                          entryType: "TimelineTimelineCursor",
                          cursorType: "Bottom",
                          value: "bottom-cursor",
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  };
}

beforeEach(() => {
  mockEvaluateResponse = null;
  lastEvaluateUrl = null;
  lastEvaluateInit = null;
});

describe("parseNotificationsResponse", () => {
  test("parses notification entries and bottom cursor", () => {
    const result = parseNotificationsResponse(notificationFixture());
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe("bottom-cursor");
    expect(result.items[0].id).toBe("n1");
    expect(result.items[0].type).toBe("person_icon");
    expect(result.items[0].text).toBe("Alice followed you");
    expect(result.items[0].url).toBe("https://twitter.com/alice");
    expect(result.items[0].actors[0].screenName).toBe("alice");
  });

  test("returns empty result for missing instructions", () => {
    const result = parseNotificationsResponse({});
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

describe("fetchNotifications", () => {
  test("calls NotificationsTimeline GraphQL endpoint", async () => {
    mockEvaluateResponse = notificationFixture();
    const client = new TwitterGraphQLClient();
    const result = await client.fetchNotifications(20);
    expect(result.items[0].text).toBe("Alice followed you");
    expect(lastEvaluateUrl).toContain("/graphql/N3mgBYxj7qj5GUZmyYuKFg/NotificationsTimeline");
    expect(lastEvaluateUrl).toContain("timeline_type");
    expect(lastEvaluateInit?.method).toBe("GET");
    expect(lastEvaluateInit?.headers?.Referer).toBe("https://x.com/notifications");
  });

  test("passes cursor when provided", async () => {
    mockEvaluateResponse = notificationFixture();
    const client = new TwitterGraphQLClient();
    await client.fetchNotifications(20, "cursor-123");
    expect(lastEvaluateUrl).toContain(encodeURIComponent('"cursor"'));
  });
});
