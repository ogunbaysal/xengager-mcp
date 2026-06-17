/**
 * Centralised timing constants for all randSleep() and waitForSelector() calls.
 * Adjust here to tune stealth behaviour globally.
 *
 * Key principles (X/Twitter bot detection in 2026):
 * - Jitter (randomised ranges) is the #1 bot defence — fixed intervals are the
 *   biggest tell. All randSleep() calls use min/max ranges for natural variance.
 * - Combined with stealthClick mouse movement + randomised user agents, these
 *   timings stay well within human-like action rates (10–30 actions/hour).
 * - Cloudflare Turnstile watches for machine-like *patterns*, not absolute delay
 *   values — impossible sequences (instant full-scroll after page load) and
 *   perfectly regular cadence are the red flags, not sub-second pauses.
 * - Within-page interactions (scroll, click, tab switch) can be faster than
 *   full page navigations because the SPA handles them client-side.
 */

export const TIMINGS = {
  // ── Page navigation ───────────────────────────────────────────────────────
  /** After page.goto() — lets the SPA finish hydrating */
  PAGE_LOAD:       { min: 1500, max: 2500 },

  // ── Tweet detail page ─────────────────────────────────────────────────────
  /** After navigating to a tweet permalink before scraping */
  TWEET_LOAD:      { min: 1000, max: 2000 },

  // ── Infinite-scroll collection ────────────────────────────────────────────
  /** Between each scroll step in scrollCollect */
  SCROLL_STEP:     { min: 800,  max: 1800 },

  // ── Timeline tab switching ────────────────────────────────────────────────
  /** After clicking "For You" / "Following" tabs */
  TAB_SWITCH:      { min: 800,  max: 1500 },

  // ── Compose / tweet actions ───────────────────────────────────────────────
  /** Before interacting with a dialog or modal */
  MODAL_OPEN:      { min: 500,  max: 1200 },
  /** After the compose textarea appears */
  COMPOSE_OPEN:    { min: 1000, max: 2000 },
  /** After submitting a tweet (single or last in thread) */
  POST_TWEET:      { min: 1500, max: 3000 },
  /** After typing text into the compose textarea */
  AFTER_TYPE:      { min: 300,  max: 800  },
  /** Between individual tweets in a thread */
  THREAD_STEP:     { min: 150,  max: 400  },

  // ── General UI interactions ───────────────────────────────────────────────
  /** Between button clicks (like, repost, bookmark, follow …) */
  UI_ACTION:       { min: 300,  max: 1000 },
  /** Short pause between quick sequential actions */
  UI_ACTION_SHORT: { min: 300,  max: 700  },

  // ── Stealth mouse movement ────────────────────────────────────────────────
  /** Delay range used inside stealthClick mouse-move */
  MOUSE_MOVE:      { min: 30,   max: 100  },

  // ── waitForSelector timeouts (ms) ─────────────────────────────────────────
  SELECTOR_TIMEOUT:        8_000,
  SELECTOR_TIMEOUT_SHORT:  6_000,
} as const;
