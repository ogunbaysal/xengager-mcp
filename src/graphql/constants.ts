export const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs" +
  "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export const QUERY_IDS: Record<string, string> = {
  HomeTimeline: "c-CzHF1LboFilMpsx4ZCrQ",
  HomeLatestTimeline: "BKB7oi212Fi7kQtCBGE4zA",
  UserByScreenName: "1VOOyvKkiI3FMmkeDNxM9A",
  UserTweets: "q6xj5bs0hapm9309hexA_g",
  TweetDetail: "xd_EMdYvB9hfZsZ6Idri0w",
  Likes: "lIDpu_NWL7_VhimGGt0o6A",
  SearchTimeline: "VhUd6vHVmLBcw0uX-6jMLA",
  Bookmarks: "2neUNDqrrFzbLui8yallcQ",
  ListLatestTweetsTimeline: "RlZzktZY_9wJynoepm8ZsA",
  Followers: "IOh4aS6UdGWGJUYTqliQ7Q",
  Following: "zx6e-TLzRkeDO_a7p4b3JQ",
  CreateTweet: "IID9x6WsdMnTlXnzXGq8ng",
  DeleteTweet: "VaenaVgh5q5ih7kvyVjgtg",
  FavoriteTweet: "lI07N6Otwv1PhnEgXILM7A",
  UnfavoriteTweet: "ZYKSe-w7KEslx3JhSIk5LA",
  CreateRetweet: "ojPdsZsimiJrUGLR1sjUtA",
  DeleteRetweet: "iQtK4dl5hBmXewYZuEOKVw",
  CreateBookmark: "aoDbu3RHznuiSkQ9aNM67Q",
  DeleteBookmark: "Wlmlj2-xzyS1GN3a6cj-mQ",
  TweetResultByRestId: "7xflPyRiUxGVbJd4uWmbfg",
  BookmarkFoldersSlice: "i78YDd0Tza-dV4SYs58kRg",
  BookmarkFolderTimeline: "hNY7X2xE2N7HVF6Qb_mu6w",
  NotificationsTimeline: "N3mgBYxj7qj5GUZmyYuKFg",
};

export const DEFAULT_FEATURES: Record<string, boolean> = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  rweb_video_timestamps_enabled: true,
  responsive_web_media_download_video_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  responsive_web_enhance_cards_enabled: false,
};

export const NOTIFICATIONS_FEATURES: Record<string, boolean> = {
  ...DEFAULT_FEATURES,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  longform_notetweets_inline_media_enabled: false,
};

export const USER_BY_SCREEN_NAME_FEATURES: Record<string, boolean> = {
  hidden_profile_subscriptions_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

/** Build a compact features object (omit false values to keep URL short). */
export function compactFeatures(features: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(features).filter(([, v]) => v !== false));
}

/** Build a GraphQL GET URL with encoded variables and features. */
export function buildGraphqlUrl(
  queryId: string,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, boolean>,
  fieldToggles?: Record<string, boolean>,
): string {
  const compact = compactFeatures(features);
  let url =
    `https://x.com/i/api/graphql/${queryId}/${operationName}` +
    `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&features=${encodeURIComponent(JSON.stringify(compact))}`;
  if (fieldToggles && Object.keys(fieldToggles).length > 0) {
    url += `&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`;
  }
  return url;
}
