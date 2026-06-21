export type SiteId = "fmkorea" | "clien" | "arca" | "dcinside";
export type SearchSort = "latest" | "recency" | "accuracy" | "relevance";

export interface SearchQuery {
  label: string;
  searchUrl: string;
}

export interface FetchHtmlOptions {
  timeoutMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
}

export interface BrowserManagerOptions {
  headed?: boolean;
  chromePath?: string;
  userAgent?: string;
}

export interface CommentRecord {
  commentId: string;
  author: string | null;
  postedAt: string | null;
  likeCount: number | null;
  depth: number;
  bodyText: string;
}

export interface BasePostData {
  site: SiteId;
  postId: string;
  url: string;
  boardCode?: string | null;
  boardName?: string | null;
  categoryName?: string | null;
  title?: string | null;
  author?: string | null;
  postedAt?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  dislikeCount?: number | null;
  commentCount?: number | null;
}

export interface PostCandidate extends BasePostData {
  searchExcerpt?: string | null;
  matchedQueries: string[];
  matchedSearchUrls: string[];
  searchPages: number[];
}

export interface PostDetail extends BasePostData {
  bodyText: string;
  comments: CommentRecord[];
}

export interface PostRecord extends BasePostData {
  searchExcerpt?: string | null;
  matchedQueries: string[];
  matchedSearchUrls: string[];
  searchPages: number[];
  bodyText: string;
  comments: CommentRecord[];
  crawlStatus: "ok" | "detail_failed";
  crawlError: string;
}

export interface SearchPageResult {
  items: PostCandidate[];
  hasNextPage: boolean;
}

export interface CrawlerTools {
  fetchHtml: (url: string, options?: FetchHtmlOptions) => Promise<string>;
  postForm: (
    url: string,
    data: Record<string, string | number | null | undefined>,
    options?: FetchHtmlOptions,
  ) => Promise<string>;
  fetchRenderedHtml?: (
    siteId: SiteId,
    url: string,
    selector?: string,
  ) => Promise<string>;
}

export interface SiteAdapter {
  id: SiteId;
  displayName: string;
  buildSearchUrl?: (keyword: string, sort: SearchSort) => string;
  fetchSearchPage: (
    query: SearchQuery,
    pageNumber: number,
    tools: CrawlerTools,
  ) => Promise<SearchPageResult>;
  fetchPostDetail: (
    candidate: PostCandidate,
    tools: CrawlerTools,
  ) => Promise<PostDetail>;
}

export interface CliOptions {
  cutoffDate: string;
  noCutoff: boolean;
  delayMs: number;
  output: string;
  maxPages: number;
  headed: boolean;
  chromePath: string;
  sites: SiteId[];
  keywords: string[];
  sort: SearchSort;
  queryLabel?: string;
  queryUrl?: string;
  help?: boolean;
}

export type QueryConfig = Record<SiteId, SearchQuery[]>;
