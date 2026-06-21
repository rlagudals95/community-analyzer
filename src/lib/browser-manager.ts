import fs from "node:fs";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import {
  DEFAULT_CHROME_PATH,
  DEFAULT_USER_AGENT,
  normalizeInlineText,
} from "./common";

import type { BrowserManagerOptions, SiteId } from "../types";

export class BrowserManager {
  private readonly options: BrowserManagerOptions;

  private readonly contexts = new Map<SiteId, BrowserContext>();

  private readonly pages = new Map<SiteId, Page>();

  constructor(options: BrowserManagerOptions = {}) {
    this.options = options;
  }

  async getContext(siteId: SiteId): Promise<BrowserContext> {
    const existingContext = this.contexts.get(siteId);
    if (existingContext) {
      return existingContext;
    }

    const userDataDir = path.resolve(process.cwd(), "profiles", siteId);
    fs.mkdirSync(userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: this.options.chromePath || DEFAULT_CHROME_PATH,
      headless: !this.options.headed,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      viewport: { width: 1440, height: 1400 },
      userAgent: this.options.userAgent || DEFAULT_USER_AGENT,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    this.contexts.set(siteId, context);
    return context;
  }

  async getPage(siteId: SiteId): Promise<Page> {
    const existingPage = this.pages.get(siteId);
    if (existingPage && !existingPage.isClosed()) {
      return existingPage;
    }

    const context = await this.getContext(siteId);
    const page = context.pages()[0] || (await context.newPage());
    this.pages.set(siteId, page);
    return page;
  }

  async fetchRenderedHtml(
    siteId: SiteId,
    url: string,
    selector?: string,
  ): Promise<string> {
    const page = await this.getPage(siteId);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

    if (selector) {
      await page.waitForSelector(selector, { timeout: 30000 });
    }

    const title = await page.title();
    const bodyText = normalizeInlineText(
      await page.locator("body").innerText().catch(() => ""),
    );

    if (
      /just a moment/i.test(title) ||
      /enable javascript and cookies to continue/i.test(bodyText)
    ) {
      throw new Error(
        `${siteId} rendered a challenge page. Rerun with --headed and complete the challenge in the opened Chrome profile.`,
      );
    }

    return page.content();
  }

  async close(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close();
    }

    this.contexts.clear();
    this.pages.clear();
  }
}
