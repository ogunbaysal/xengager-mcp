# Limitations & Cautions

## Rate Limiting & Stealth

The browser uses randomized user agents, stealth plugin (evades `navigator.webdriver`), human-like mouse movement, and randomized delays between actions. Despite these measures, aggressive scraping can trigger X rate limits or temporary restrictions. **Space out calls** and use reasonable limits.

## Session Authentication

Valid `X_AUTH_TOKEN` and `X_CT0` environment variables are required. To obtain them:
1. Log into x.com in Chrome
2. Open DevTools → Application → Cookies → x.com
3. Copy `auth_token` and `ct0` values

These expire periodically. If tools start returning auth errors, refresh the credentials.

## No Concurrency

All tools share one Puppeteer browser instance. Each tool navigates the page and extracts data — **do not call multiple tools simultaneously**. Sequence all calls.

## X.com Access Restrictions

- **Likes**: Only visible for the authenticated account owner. Other users' likes return an explicit error (not an empty list).
- **Protected accounts**: Cannot be accessed without following approval.
- **NSFW/age-restricted content**: May require additional authentication the headless browser doesn't handle.

## Timing

Each tool call takes 3–15 seconds depending on page load, scrolling, and UI interactions. A full 5-page paginated read takes 15–30 seconds. Posting a 5-tweet thread takes 10–20 seconds. Plan accordingly.

## Error Reporting

If you encounter unexpected behavior, report the full request parameters and response payload — this helps diagnose issues faster.
