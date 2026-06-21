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
  npm run crawl -- "정수기 렌탈" 2025-01-01 120
  npm run crawl -- "인터넷 설치" 50
  npm run crawl -- [options]

Positional shortcut:
  "키워드" "수집 종료 날짜(YYYY-MM-DD)" "최대 글 수"
  "키워드" "최대 글 수"  # 날짜 제한 없이 최신순 N건

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
  --max-posts=100                     Max saved posts across all selected sites
  --limit=100                         Alias for --max-posts
  --max-posts-per-site=30             Max collected posts per site
  --site-limit=30                     Alias for --max-posts-per-site
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

function parsePositiveIntegerOption(
  value: string | undefined,
  optionName: string,
): number {
  const raw = String(value || "").trim();
  const parsed = Number.parseInt(raw, 10);

  if (!raw || !Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive number.`);
  }

  return parsed;
}

function isDateLike(value: string | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function isPositiveIntegerString(value: string | undefined): boolean {
  return /^[1-9]\d*$/.test(String(value || "").trim());
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = value.replace(/[^\p{L}\p{N}-]+/gu, "");
  return sanitized || "keyword";
}

function buildShortcutOutputPath(options: CliOptions): string {
  const keyword = options.keywords[0] || "keyword";
  const dateLabel = options.noCutoff ? "최신" : `${options.cutoffDate}까지`;
  const countLabel = options.maxPosts ? `${options.maxPosts}건` : "전체";

  return path.resolve(
    process.cwd(),
    "output",
    `${sanitizeFilenamePart(keyword)}_${dateLabel}_${countLabel}.csv`,
  );
}

function applyPositionalShortcut(
  positionalArgs: string[],
  options: CliOptions,
  outputWasProvided: boolean,
): void {
  if (!positionalArgs.length) {
    return;
  }

  if (positionalArgs.length > 3) {
    throw new Error(
      "Too many positional arguments. Use: npm run crawl -- \"키워드\" 2025-01-01 100",
    );
  }

  if (options.keywords.length || options.queryLabel || options.queryUrl) {
    throw new Error(
      "Positional shortcut cannot be used with --keyword/--keywords or --query-url.",
    );
  }

  const [keyword, dateOrCount, count] = positionalArgs;
  options.keywords = [keyword];

  if (dateOrCount) {
    if (isDateLike(dateOrCount)) {
      options.cutoffDate = dateOrCount;
      options.noCutoff = false;
    } else if (isPositiveIntegerString(dateOrCount)) {
      options.maxPosts = parsePositiveIntegerOption(dateOrCount, "positional max posts");
      options.noCutoff = true;
    } else {
      throw new Error(
        "Second positional argument must be a date like 2025-01-01 or a max post count like 100.",
      );
    }
  }

  if (count) {
    if (!isDateLike(dateOrCount)) {
      throw new Error(
        "Third positional argument is only allowed after a date. Use: \"키워드\" 2025-01-01 100",
      );
    }

    options.maxPosts = parsePositiveIntegerOption(count, "positional max posts");
  }

  if (!outputWasProvided) {
    options.output = buildShortcutOutputPath(options);
  }
}

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const configuredSites = Object.keys(siteRegistry) as SiteId[];
  const positionalArgs: string[] = [];
  let outputWasProvided = false;

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
      outputWasProvided = true;
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

    if (arg.startsWith("--max-posts-per-site") || arg.startsWith("--site-limit")) {
      const { value, consumed } = readArgValue(args, index);
      options.maxPostsPerSite = parsePositiveIntegerOption(
        value,
        "--max-posts-per-site/--site-limit",
      );
      index += consumed;
      continue;
    }

    if (arg.startsWith("--max-posts") || arg.startsWith("--limit")) {
      const { value, consumed } = readArgValue(args, index);
      options.maxPosts = parsePositiveIntegerOption(value, "--max-posts/--limit");
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

    if (!arg.startsWith("--")) {
      positionalArgs.push(arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  applyPositionalShortcut(positionalArgs, options, outputWasProvided);

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

  if (
    options.maxPosts !== undefined &&
    (!Number.isFinite(options.maxPosts) || options.maxPosts < 1)
  ) {
    throw new Error("--max-posts/--limit must be a positive number.");
  }

  if (
    options.maxPostsPerSite !== undefined &&
    (!Number.isFinite(options.maxPostsPerSite) || options.maxPostsPerSite < 1)
  ) {
    throw new Error("--max-posts-per-site/--site-limit must be a positive number.");
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
  maxCandidates?: number,
): Promise<PostCandidate[]> {
  const cutoffDate = options.noCutoff
    ? null
    : parseDate(options.cutoffDate)?.startOf("day") || null;

  if (!options.noCutoff && (!cutoffDate || !cutoffDate.isValid())) {
    throw new Error(`Invalid cutoff date: ${options.cutoffDate}`);
  }

  const byKey = new Map<string, PostCandidate>();
  const queries = getQueriesForSite(site, options);
  let reachedCandidateLimit = false;

  queryLoop:
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

        if (maxCandidates !== undefined && byKey.size >= maxCandidates) {
          reachedCandidateLimit = true;
          break;
        }
      }

      if (reachedCandidateLimit) {
        console.log(
          `  - page ${pageNumber}: reached candidate limit ${maxCandidates}, stopping this site`,
        );
        break queryLoop;
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
      const remainingGlobalPosts =
        options.maxPosts === undefined ? undefined : options.maxPosts - allPosts.length;

      if (remainingGlobalPosts !== undefined && remainingGlobalPosts <= 0) {
        console.log(`Reached max posts ${options.maxPosts}, stopping remaining sites`);
        break;
      }

      const queries = getQueriesForSite(site, options);
      if (!queries.length) {
        console.log(`[${site.displayName}] no configured queries, skipping`);
        continue;
      }

      const siteCandidateLimit = Math.min(
        options.maxPostsPerSite ?? Number.POSITIVE_INFINITY,
        remainingGlobalPosts ?? Number.POSITIVE_INFINITY,
      );
      const maxCandidates = Number.isFinite(siteCandidateLimit)
        ? siteCandidateLimit
        : undefined;
      const candidates = await collectCandidatesForSite(site, options, tools, maxCandidates);
      console.log(`[${site.displayName}] unique posts after dedupe: ${candidates.length}`);

      const posts = await hydrateDetails(site, candidates, options, tools);
      allPosts.push(...posts);

      if (options.maxPosts !== undefined && allPosts.length >= options.maxPosts) {
        console.log(`Reached max posts ${options.maxPosts}, stopping remaining sites`);
        break;
      }
    }

    writePostsCsv(allPosts, options.output);
    console.log(`\nSaved ${allPosts.length} posts to ${options.output}`);
  } finally {
    await browserManager.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const errorMessage = getErrorMessage(error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    } else {
      console.error(errorMessage);
    }
    process.exitCode = 1;
  });
}
