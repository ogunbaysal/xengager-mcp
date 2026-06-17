import {
  TwitterAPIError,
  TwitterAuthError,
  TwitterGraphQLClient,
  TwitterRateLimitError,
} from "../graphql/client.js";
import type { GqlWriteResult } from "../graphql/types.js";

export type GraphQLClientLike = InstanceType<typeof TwitterGraphQLClient>;

type ClientFactory = () => GraphQLClientLike;

let clientFactory: ClientFactory = () => new TwitterGraphQLClient();

export function setGraphQLClientFactory(factory: ClientFactory): void {
  clientFactory = factory;
}

export function resetGraphQLClientFactory(): void {
  clientFactory = () => new TwitterGraphQLClient();
}

export function client(): GraphQLClientLike {
  return clientFactory();
}

export function textResponse(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

export function extractTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.match(/\/status\/(\d+)/)?.[1] ?? null;
}

export function actionResponse(action: string, result: GqlWriteResult) {
  return {
    success: result.success,
    message: result.success ? `${action} succeeded` : `${action} failed`,
    tweetId: result.id,
    tweetUrl: result.url,
  };
}

export function errorPayload(err: unknown) {
  if (err instanceof TwitterAuthError) {
    return { error: "X session expired or missing auth cookies/env values", detail: err.message };
  }
  if (err instanceof TwitterRateLimitError) {
    return { error: "X rate limit reached", detail: err.message };
  }
  if (err instanceof TwitterAPIError) {
    return { error: "X GraphQL API request failed", status: err.status, detail: err.message };
  }
  return { error: String(err) };
}

export async function safeJson<T>(fn: () => Promise<T>) {
  try {
    return textResponse(await fn());
  } catch (err) {
    return textResponse(errorPayload(err));
  }
}
