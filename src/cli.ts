import path from "node:path";

import queryConfig from "./config/queries";
import { BrowserManager } from "./lib/browser-manager";
import {
  DEFAULT_CHROME_PATH,
  dedupeNumbers,
  dedupeStrings,
  getErrorMessage,
  isBeforeCutoff,
  mergeCandidate,
  parseDate,
  sleep,
} from "./lib/common";
import { writePostsCsv } from "./lib/csv";
import { fetchHtml, postForm } from "./lib/http";
import arca from "./sites/arca";
import clien from "./sites/clien";
import dcinside from "./sites/dcinside";
import fmkorea from "./sites/fmkorea";

import type {
  CliOptions,
  CrawlerTools,
  PostCandidate,
  PostRecord,
  SearchQuery,
  SearchSort,
  SiteAdapter,
  SiteId,
} from "./types";

const siteRegistry: Record<SiteId, SiteAdapter> = {
  fmkorea,
  clien,
  arca,
  dcinside,
};

function shouldStopAtFirstOldResult(searchUrl: string): boolean {
  return (
    !searchUrl.includes("sph_sort=relevance") &&
    !searchUrl.includes("sort=accuracy") &&
    !searchUrl.includes("/sort/accuracy/")
  );
}

function printHelp(): void {
  console.log(`
Usage:
  npm run crawl -- [options]

Options:
  --site=fmkorea,clien,arca,dcinside  Crawl only selected sites
  --keyword="정수기 렌탈"              Build search URLs from one keyword
  --keywords="정수기 렌탈,비데 렌탈"   Build search URLs from comma-separated keywords
  --sort=latest|accuracy|relevance    Search sort for keyword-generated URLs
  --cutoff-date=2025-01-01            Stop when search results get older than this date
  --until-date=2025-01-01             Alias for --cutoff-date
  --no-cutoff                         Ignore posted_at cutoff and crawl all matched pages
  --output=output/posts.csv           Output CSV path
  --delay-ms=1200                     Delay between page/detail requests
  --max-pages=200                     Max search pages per query
  --pages=3                           Alias for --max-pages
  --query-label="정수기 렌탈"         Use a one-off query label instead of config
  --query-url="https://..."           Use a one-off search URL instead of config
  --headed                            Open Chrome visibly (recommended for challenge pages)
  --chrome-path=/path/to/chrome
  --help                              Show this help
`);
}

function readArgValue(
  args: string[],
  index: number,
): { key: string; value?: string; consumed: number } {
  const arg = args[index];
  const separatorIndex = arg.indexOf("=");
  const key = separatorIndex >= 0 ? arg.slice(0, separatorIndex) : arg;
  const inlineValue = separatorIndex >= 0 ? arg.slice(separatorIndex + 1) : undefined;

  if (inlineValue !== undefined) {
    return { key, value: inlineValue, consumed: 1 };
  }

  return { key, value: args[index + 1], consumed: 2 };
}

function parseKeywordList(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function normalizeSort(value: string | undefined): SearchSort {
  const sort = String(value || "latest").trim().toLowerCase();
  if (sort === "latest" || sort === "recency" || sort === "accuracy" || sort === "relevance") {
    return sort;
  }

  throw new Error(`Unsupported sort: ${value}`);
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const configuredSites = Object.keys(siteRegistry) as SiteId[];

  const options: CliOptions = {
    cutoffDate: "2025-01-01",
    noCutoff: false,
    delayMs: 1200,
    output: path.resolve(process.cwd(), "output", "rental-community-posts.csv"),
    maxPages: 200,
    headed: false,
    chromePath: DEFAULT_CHROME_PATH,
    sites: configuredSites,
    keywords: [],
    sort: "latest",
  };

  for (let index = 0; index < args.length; ) {
    const arg = args[index];

    if (arg === "--help") {
      options.help = true;
      index += 1;
      continue;
    }

    if (arg === "--headed") {
      options.headed = true;
      index += 1;
      continue;
    }

    if (arg === "--no-cutoff") {
      options.noCutoff = true;
      index += 1;
      continue;
    }

    if (arg.startsWith("--site")) {
      const { value, consumed } = readArgValue(args, index);
      const requestedSites = String(value || "")
        .split(",")
        .map((site) => site.trim())
        .filter(Boolean);
      const invalidSites = requestedSites.filter((site) => !(site in siteRegistry));

      if (invalidSites.length) {
        throw new Error(`Unsupported site: ${invalidSites.join(", ")}`);
      }

      options.sites = requestedSites as SiteId[];
      index += consumed;
      continue;
    }

    if (arg.startsWith("--cutoff-date") || arg.startsWith("--until-date")) {
      const { value, consumed } = readArgValue(args, index);
      options.cutoffDate = value || options.cutoffDate;
      index += consumed;
      continue;
    }

    if (arg.startsWith("--output")) {
      const { value, consumed } = readArgValue(args, index);
      options.output = path.resolve(process.cwd(), value || options.output);
      index += consumed;
      continue;
    }

    if (arg.startsWith("--delay-ms")) {
      const { value, consumed } = readArgValue(args, index);
      options.delayMs = Number.parseInt(value || String(options.delayMs), 10);
      index += consumed;
      continue;
    }

    if (arg.startsWith("--max-pages") || arg.startsWith("--pages")) {
      const { value, consumed } = readArgValue(args, index);
      options.maxPages = Number.parseInt(value || String(options.maxPages), 10);
      index += consumed;
      continue;
    }

    if (arg.startsWith("--keyword")) {
      const { key, value, consumed } = readArgValue(args, index);
      const keywords =
        key === "--keywords"
          ? parseKeywordList(value)
          : [String(value || "").trim()].filter(Boolean);
      options.keywords.push(...keywords);
      index += consumed;
      continue;
    }

    if (arg.startsWith("--sort")) {
      const { value, consumed } = readArgValue(args, index);
      options.sort = normalizeSort(value);
      index += consumed;
      continue;
    }

    if (arg.startsWith("--chrome-path")) {
      const { value, consumed } = readArgValue(args, index);
      options.chromePath = value || options.chromePath;
      index += consumed;
      continue;
    }

    if (arg.startsWith("--query-label")) {
      const { value, consumed } = readArgValue(args, index);
      options.queryLabel = value || options.queryLabel;
      index += consumed;
      continue;
    }

    if (arg.startsWith("--query-url")) {
      const { value, consumed } = readArgValue(args, index);
      options.queryUrl = value || options.queryUrl;
      index += consumed;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if ((options.queryLabel && !options.queryUrl) || (!options.queryLabel && options.queryUrl)) {
    throw new Error("--query-label and --query-url must be used together.");
  }

  if (options.queryUrl && options.sites.length !== 1) {
    throw new Error("--query-url override requires exactly one --site value.");
  }

  if (options.queryUrl && options.keywords.length) {
    throw new Error("--query-url override cannot be used together with --keyword/--keywords.");
  }

  if (!options.sites.length) {
    throw new Error("At least one supported --site value is required.");
  }

  if (!Number.isFinite(options.maxPages) || options.maxPages < 1) {
    throw new Error("--max-pages/--pages must be a positive number.");
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("--delay-ms must be zero or a positive number.");
  }

  return options;
}

function getQueriesForSite(site: SiteAdapter, options: CliOptions): SearchQuery[] {
  if (options.queryLabel && options.queryUrl) {
    return [
      {
        label: options.queryLabel,
        searchUrl: options.queryUrl,
      },
    ];
  }

  if (options.keywords.length) {
    const buildSearchUrl = site.buildSearchUrl;

    if (!buildSearchUrl) {
      throw new Error(`${site.displayName} does not support keyword-generated search URLs.`);
    }

    return dedupeStrings(options.keywords).map((keyword) => ({
      label: keyword,
      searchUrl: buildSearchUrl(keyword, options.sort),
    }));
  }

  return queryConfig[site.id] || [];
}

async function collectCandidatesForSite(
  site: SiteAdapter,
  options: CliOptions,
  tools: CrawlerTools,
): Promise<PostCandidate[]> {
  const cutoffDate = options.noCutoff
    ? null
    : parseDate(options.cutoffDate)?.startOf("day") || null;

  if (!options.noCutoff && (!cutoffDate || !cutoffDate.isValid())) {
    throw new Error(`Invalid cutoff date: ${options.cutoffDate}`);
  }

  const byKey = new Map<string, PostCandidate>();
  const queries = getQueriesForSite(site, options);

  for (const query of queries) {
    console.log(`\n[${site.displayName}] collecting search results for "${query.label}"`);
    const stopAtFirstOldResult = shouldStopAtFirstOldResult(query.searchUrl);

    for (let pageNumber = 1; pageNumber <= options.maxPages; pageNumber += 1) {
      const { items, hasNextPage } = await site.fetchSearchPage(query, pageNumber, tools);

      if (!items.length) {
        console.log(`  - page ${pageNumber}: no items, stopping`);
        break;
      }

      console.log(`  - page ${pageNumber}: ${items.length} items`);
      let reachedCutoff = false;

      for (const item of items) {
        if (cutoffDate && item.postedAt && isBeforeCutoff(item.postedAt, cutoffDate)) {
          if (stopAtFirstOldResult) {
            reachedCutoff = true;
            break;
          }

          continue;
        }

        const key = `${site.id}:${item.boardCode || ""}:${item.postId}`;
        const merged = mergeCandidate(byKey.get(key), item);
        byKey.set(key, merged);
      }

      if (reachedCutoff) {
        console.log(
          `  - page ${pageNumber}: reached cutoff ${options.cutoffDate}, stopping this query`,
        );
        break;
      }

      if (stopAtFirstOldResult && !hasNextPage) {
        console.log(`  - page ${pageNumber}: no next page, stopping`);
        break;
      }

      if (!stopAtFirstOldResult && !hasNextPage) {
        console.log(
          `  - page ${pageNumber}: pagination link missing, continuing until max-pages or empty page`,
        );
      }

      await sleep(options.delayMs);
    }
  }

  return [...byKey.values()].sort((left, right) => {
    const leftValue = parseDate(left.postedAt)?.valueOf() || 0;
    const rightValue = parseDate(right.postedAt)?.valueOf() || 0;
    return rightValue - leftValue;
  });
}

async function hydrateDetails(
  site: SiteAdapter,
  candidates: PostCandidate[],
  options: CliOptions,
  tools: CrawlerTools,
): Promise<PostRecord[]> {
  const posts: PostRecord[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    console.log(
      `[${site.displayName}] detail ${index + 1}/${candidates.length}: ${candidate.title}`,
    );

    try {
      const detail = await site.fetchPostDetail(candidate, tools);
      posts.push({
        ...candidate,
        ...detail,
        matchedQueries: dedupeStrings(candidate.matchedQueries),
        matchedSearchUrls: dedupeStrings(candidate.matchedSearchUrls),
        searchPages: dedupeNumbers(candidate.searchPages).sort(
          (left, right) => left - right,
        ),
        crawlStatus: "ok",
        crawlError: "",
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      posts.push({
        ...candidate,
        comments: [],
        bodyText: "",
        crawlStatus: "detail_failed",
        crawlError: errorMessage,
      });
      console.error(`  ! detail failed: ${errorMessage}`);
    }

    await sleep(options.delayMs);
  }

  return posts;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  const selectedSites = options.sites.map((siteId) => {
    const site = siteRegistry[siteId];
    if (!site) {
      throw new Error(`Unsupported site: ${siteId}`);
    }
    return site;
  });

  const browserManager = new BrowserManager({
    headed: options.headed,
    chromePath: options.chromePath,
  });

  const tools: CrawlerTools = {
    fetchHtml,
    postForm,
    fetchRenderedHtml: browserManager.fetchRenderedHtml.bind(browserManager),
  };

  try {
    const allPosts: PostRecord[] = [];

    for (const site of selectedSites) {
      const queries = getQueriesForSite(site, options);
      if (!queries.length) {
        console.log(`[${site.displayName}] no configured queries, skipping`);
        continue;
      }

      const candidates = await collectCandidatesForSite(site, options, tools);
      console.log(`[${site.displayName}] unique posts after dedupe: ${candidates.length}`);

      const posts = await hydrateDetails(site, candidates, options, tools);
      allPosts.push(...posts);
    }

    writePostsCsv(allPosts, options.output);
    console.log(`\nSaved ${allPosts.length} posts to ${options.output}`);
  } finally {
    await browserManager.close();
  }
}

void main().catch((error: unknown) => {
  const errorMessage = getErrorMessage(error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  } else {
    console.error(errorMessage);
  }
  process.exitCode = 1;
});
