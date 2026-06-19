import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { TIMINGS } from "./timings.js";
import { PageQueue } from "./queue.js";

puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
];

let _browser: Browser | null = null;
let _readPage: Page | null = null;
let _writePage: Page | null = null;

const readQueue = new PageQueue();
const writeQueue = new PageQueue();

export function randSleep(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  await page.setUserAgent(ua!);
  await page.setViewport({
    width: 1280 + Math.floor(Math.random() * 100),
    height: 800 + Math.floor(Math.random() * 100),
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return "Intel Inc.";
      if (parameter === 37446) return "Intel Iris OpenGL Engine";
      return getParameter.call(this, parameter);
    };
  });
  return page;
}

async function applyCookies(page: Page, authToken: string, ct0: string): Promise<void> {
  await page.setCookie(
    { name: "auth_token", value: authToken, domain: ".x.com", path: "/", httpOnly: true, secure: true },
    { name: "ct0", value: ct0, domain: ".x.com", path: "/", secure: true },
  );
}

async function launch(): Promise<{ readPage: Page; writePage: Page }> {
  const authToken = process.env.X_AUTH_TOKEN;
  const ct0 = process.env.X_CT0;

  if (!authToken || !ct0) {
    throw new Error(
      "Missing X_AUTH_TOKEN or X_CT0 in environment. " +
        "Get these from DevTools → Application → Cookies → x.com",
    );
  }

  const browser = await (puppeteer as any).launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-dev-shm-usage",
      "--lang=en-US,en",
    ],
  });

  let readPage: Page;
  let writePage: Page;

  try {
    [readPage, writePage] = await Promise.all([setupPage(browser), setupPage(browser)]);
    await Promise.all([
      applyCookies(readPage, authToken, ct0),
      applyCookies(writePage, authToken, ct0),
    ]);

    // Navigate read page fully; write page only needs x.com origin for fetch calls
    await Promise.all([
      readPage.goto("https://x.com/home", { waitUntil: "networkidle2" }),
      writePage.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded" }),
    ]);
  } catch (err) {
    await browser.close();
    throw new Error(`Failed to initialize browser pages: ${err}`);
  }

  if (readPage.url().includes("/login") || readPage.url().includes("/i/flow/login")) {
    await browser.close();
    throw new Error("X session invalid. Check X_AUTH_TOKEN and X_CT0 in .env");
  }

  _browser = browser;
  _readPage = readPage;
  _writePage = writePage;

  return { readPage, writePage };
}

async function ensurePages(): Promise<{ readPage: Page; writePage: Page }> {
  if (
    _browser &&
    (_browser as any).connected &&
    _readPage && !_readPage.isClosed() &&
    _writePage && !_writePage.isClosed()
  ) {
    return { readPage: _readPage, writePage: _writePage };
  }
  return launch();
}

function resetPages(page: Page): void {
  try {
    if (page.isClosed()) {
      _readPage = null;
      _writePage = null;
    }
  } catch {
    _readPage = null;
    _writePage = null;
  }
}

export function withReadPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  return readQueue.run(async () => {
    const { readPage } = await ensurePages();
    try {
      return await fn(readPage);
    } catch (err) {
      resetPages(readPage);
      throw err;
    }
  });
}

export function withWritePage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  return writeQueue.run(async () => {
    const { writePage } = await ensurePages();
    try {
      return await fn(writePage);
    } catch (err) {
      resetPages(writePage);
      throw err;
    }
  });
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    try {
      await _browser.close();
    } catch {}
    _browser = null;
    _readPage = null;
    _writePage = null;
  }
}

/**
 * Collects items by repeatedly scrolling the page and extracting data.
 *
 * IMPORTANT: `extractFn` runs inside the browser context via `page.evaluate()`.
 * It must be entirely self-contained — no references to variables, imports, or
 * closures from the outer Node.js scope. Only browser globals (document, window,
 * etc.) are available inside the function body.
 */
export async function scrollCollect<T>(
  page: Page,
  extractFn: () => T[],
  idFn: (item: T) => string,
  targetCount: number,
  maxRetries = 8
): Promise<T[]> {
  const collected = new Map<string, T>();
  let retries = 0;

  while (collected.size < targetCount && retries < maxRetries) {
    const items: T[] = await page.evaluate(extractFn);
    const prev = collected.size;
    items.forEach((item) => {
      const id = idFn(item);
      if (id) collected.set(id, item);
    });

    if (collected.size === prev) {
      retries++;
    } else {
      retries = 0;
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await randSleep(TIMINGS.SCROLL_STEP.min, TIMINGS.SCROLL_STEP.max);
  }

  return Array.from(collected.values());
}

export async function stealthClick(page: Page, selector: string): Promise<boolean> {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    const box = await el.boundingBox();
    if (!box) return false;
    const x = box.x + box.width * (0.3 + Math.random() * 0.4);
    const y = box.y + box.height * (0.3 + Math.random() * 0.4);
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
    await randSleep(TIMINGS.MOUSE_MOVE.min, TIMINGS.MOUSE_MOVE.max);
    await page.mouse.click(x, y, { delay: 50 + Math.floor(Math.random() * 100) });
    return true;
  } catch {
    return false;
  }
}

export async function clickIfPresent(
  page: Page,
  selector: string,
  timeout = 3000
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return stealthClick(page, selector);
  } catch {
    return false;
  }
}
