import { load } from "cheerio";

import {
  htmlToText,
  normalizeInlineText,
  parseDate,
  parseInteger,
  textFromElement,
  toAbsoluteUrl,
  toDateTimeString,
} from "../lib/common";

import type {
  CommentRecord,
  CrawlerTools,
  PostCandidate,
  PostDetail,
  SearchPageResult,
  SearchQuery,
  SearchSort,
  SiteAdapter,
} from "../types";

const SEARCH_BASE_URL = "https://search.dcinside.com";
const GALL_BASE_URL = "https://gall.dcinside.com";
const MAX_COMMENT_PAGES = 100;

interface DcCommentApiItem {
  no?: string;
  name?: string;
  reg_date?: string;
  memo?: string;
  depth?: string | number;
  del_yn?: string;
  gallog_icon?: string;
  rcnt?: string | number;
}

interface DcCommentApiResponse {
  total_cnt?: number | string;
  comment_cnt?: number | string;
  comments?: DcCommentApiItem[] | null;
  pagination?: string | null;
}

function encodeDcinsideQuery(keyword: string): string {
  return Array.from(Buffer.from(keyword, "utf8"))
    .map((byte) => `.${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");
}

function toDcinsideSort(sort: SearchSort): "latest" | "accuracy" {
  return sort === "accuracy" || sort === "relevance" ? "accuracy" : "latest";
}

function buildKeywordSearchUrl(keyword: string, sort: SearchSort): string {
  return `${SEARCH_BASE_URL}/post/sort/${toDcinsideSort(sort)}/q/${encodeDcinsideQuery(keyword)}`;
}

function extractSearchUrlParts(searchUrl: string): { sort: string; encodedQuery: string } {
  const parsed = new URL(searchUrl);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const sortIndex = segments.indexOf("sort");
  const queryIndex = segments.indexOf("q");

  return {
    sort: sortIndex >= 0 ? segments[sortIndex + 1] || "latest" : "latest",
    encodedQuery: queryIndex >= 0 ? segments[queryIndex + 1] || "" : "",
  };
}

function buildSearchPageUrl(query: SearchQuery, pageNumber: number): string {
  const { sort, encodedQuery } = extractSearchUrlParts(query.searchUrl);
  if (pageNumber <= 1) {
    return `${SEARCH_BASE_URL}/post/sort/${sort}/q/${encodedQuery}`;
  }

  return `${SEARCH_BASE_URL}/post/p/${pageNumber}/sort/${sort}/q/${encodedQuery}`;
}

function canonicalizeDcPostUrl(url: string): string {
  const parsed = new URL(url);
  const id = parsed.searchParams.get("id");
  const no = parsed.searchParams.get("no");
  parsed.hash = "";

  if (id && no) {
    parsed.search = new URLSearchParams({ id, no }).toString();
  }

  return parsed.toString();
}

function getGalleryType(url: string): string {
  const pathname = new URL(url).pathname;
  if (pathname.includes("/mgallery/")) {
    return "mgallery";
  }

  if (pathname.includes("/mini/")) {
    return "mini";
  }

  if (pathname.includes("/person/")) {
    return "person";
  }

  return "board";
}

function extractPostIdentity(url: string): {
  boardCode: string | null;
  postId: string | null;
} {
  const parsed = new URL(url);
  const boardCode = parsed.searchParams.get("id");
  const postNo = parsed.searchParams.get("no");

  if (!boardCode || !postNo) {
    return { boardCode, postId: null };
  }

  return {
    boardCode,
    postId: `${getGalleryType(url)}:${boardCode}:${postNo}`,
  };
}

function stripTrailingCommentCount(title: string): {
  title: string;
  commentCount: number | null;
} {
  const match = title.match(/\[(\d+)]\s*$/);
  if (!match) {
    return { title, commentCount: null };
  }

  return {
    title: normalizeInlineText(title.slice(0, match.index)),
    commentCount: Number.parseInt(match[1], 10),
  };
}

function toDcinsideDateTime(
  value: string | null | undefined,
  baseDate?: string | null,
): string | null {
  const normalized = normalizeInlineText(value);
  const shortDateMatch = normalized.match(/^(\d{2})\.(\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
  if (shortDateMatch) {
    const year = parseDate(baseDate)?.year() || new Date().getFullYear();
    return toDateTimeString(
      `${year}.${shortDateMatch[1]}.${shortDateMatch[2]} ${shortDateMatch[3]}`,
    );
  }

  return toDateTimeString(normalized);
}

async function loadHtml(
  url: string,
  tools: CrawlerTools,
  selector: string,
): Promise<string> {
  try {
    return await tools.fetchHtml(url);
  } catch (error) {
    if (!tools.fetchRenderedHtml) {
      throw error;
    }

    return tools.fetchRenderedHtml("dcinside", url, selector);
  }
}

async function fetchSearchPage(
  query: SearchQuery,
  pageNumber: number,
  tools: CrawlerTools,
): Promise<SearchPageResult> {
  const url = buildSearchPageUrl(query, pageNumber);
  const html = await loadHtml(url, tools, "ul.sch_result_list > li");
  const $ = load(html);

  const items: PostCandidate[] = $("ul.sch_result_list > li")
    .toArray()
    .flatMap((element) => {
      const link = $("a.tit_txt", element).first();
      const rawTitle = normalizeInlineText(link.text());
      const titleInfo = stripTrailingCommentCount(rawTitle);
      const absoluteUrl = toAbsoluteUrl(GALL_BASE_URL, link.attr("href"));

      if (!absoluteUrl) {
        return [];
      }

      const canonicalUrl = canonicalizeDcPostUrl(absoluteUrl);
      const { boardCode, postId } = extractPostIdentity(canonicalUrl);

      if (!postId) {
        return [];
      }

      return [{
        site: "dcinside" as const,
        postId,
        url: canonicalUrl,
        boardCode,
        boardName: normalizeInlineText($("a.sub_txt", element).first().text()) || null,
        title: titleInfo.title || null,
        author: null,
        postedAt: toDcinsideDateTime($("span.date_time", element).first().text()),
        viewCount: null,
        likeCount: null,
        commentCount: titleInfo.commentCount,
        searchExcerpt:
          normalizeInlineText($("p.link_dsc_txt", element).not(".dsc_sub").first().text()) ||
          null,
        matchedQueries: [query.label],
        matchedSearchUrls: [query.searchUrl],
        searchPages: [pageNumber],
      }];
    });

  const hasNextPage =
    $(`.bottom_paging_box a[href*="/post/p/${pageNumber + 1}/"]`).length > 0;

  return { items, hasNextPage };
}

function readInputValue(
  $: ReturnType<typeof load>,
  selector: string,
): string {
  return String($(selector).first().attr("value") || "");
}

function extractScriptValue(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1] || "";
}

function parseCommentAuthor(comment: DcCommentApiItem): string | null {
  return (
    normalizeInlineText(comment.name) ||
    normalizeInlineText(htmlToText(comment.gallog_icon || "")) ||
    null
  );
}

function parseComment(
  comment: DcCommentApiItem,
  baseDate: string | null | undefined,
): CommentRecord | null {
  const commentId = normalizeInlineText(comment.no);
  if (!commentId) {
    return null;
  }

  return {
    commentId,
    author: parseCommentAuthor(comment),
    postedAt: toDcinsideDateTime(comment.reg_date, baseDate),
    likeCount: parseInteger(comment.rcnt),
    depth: Number.parseInt(String(comment.depth || "0"), 10) || 0,
    bodyText: htmlToText(comment.memo || ""),
  };
}

async function fetchComments(
  candidate: PostCandidate,
  html: string,
  tools: CrawlerTools,
): Promise<{ comments: CommentRecord[]; totalCount: number | null }> {
  const $ = load(html);
  const articleNo = readInputValue($, "#no") || new URL(candidate.url).searchParams.get("no") || "";
  const galleryId =
    readInputValue($, "#gallery_id") || new URL(candidate.url).searchParams.get("id") || "";
  const commentId =
    extractScriptValue(html, /\$\(document\)\.data\('comment_id',\s*'([^']+)'\)/) ||
    galleryId;
  const commentNo =
    extractScriptValue(html, /\$\(document\)\.data\('comment_no',\s*'([^']+)'\)/) ||
    articleNo;
  const encryptedNo = readInputValue($, "#e_s_n_o");
  const gallType =
    extractScriptValue(html, /var\s+_GALLERY_TYPE_\s*=\s*"([^"]+)"/) ||
    readInputValue($, "#_GALLTYPE_");
  const boardType = readInputValue($, "#board_type");
  const secretArticleKey = readInputValue($, "#secret_article_key");

  if (!galleryId || !articleNo || !encryptedNo) {
    return { comments: [], totalCount: null };
  }

  const byId = new Map<string, CommentRecord>();
  let totalCount: number | null = null;

  for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
    const previousSize = byId.size;
    const responseText = await tools.postForm(
      `${GALL_BASE_URL}/board/comment/`,
      {
        id: galleryId,
        no: articleNo,
        cmt_id: commentId,
        cmt_no: commentNo,
        focus_cno: "",
        focus_pno: "",
        e_s_n_o: encryptedNo,
        comment_page: page,
        sort: "D",
        prevCnt: "",
        board_type: boardType,
        _GALLTYPE_: gallType,
        secret_article_key: secretArticleKey,
      },
      {
        headers: {
          referer: candidate.url,
        },
      },
    );
    const parsed = JSON.parse(responseText) as DcCommentApiResponse;
    totalCount = parseInteger(parsed.total_cnt) ?? totalCount;

    for (const rawComment of parsed.comments || []) {
      const comment = parseComment(rawComment, candidate.postedAt);
      if (comment) {
        byId.set(comment.commentId, comment);
      }
    }

    if (!parsed.comments?.length) {
      break;
    }

    if (totalCount !== null && byId.size >= totalCount) {
      break;
    }

    if (page > 1 && byId.size === previousSize) {
      break;
    }
  }

  return { comments: [...byId.values()], totalCount };
}

async function fetchPostDetail(
  candidate: PostCandidate,
  tools: CrawlerTools,
): Promise<PostDetail> {
  const html = await loadHtml(candidate.url, tools, ".view_content_wrap");
  const $ = load(html);
  const commentResult = await fetchComments(candidate, html, tools).catch(() => ({
    comments: [] as CommentRecord[],
    totalCount: null,
  }));

  return {
    site: "dcinside",
    postId: candidate.postId,
    url: candidate.url,
    boardCode: candidate.boardCode,
    boardName: candidate.boardName,
    categoryName: normalizeInlineText($(".title_headtext").first().text()) || null,
    title:
      normalizeInlineText($(".title_subject").first().text()) || candidate.title || null,
    author:
      normalizeInlineText($(".gall_writer.ub-writer").first().attr("data-nick")) ||
      normalizeInlineText($(".gall_writer.ub-writer .nickname").first().text()) ||
      candidate.author ||
      null,
    postedAt:
      toDcinsideDateTime($(".gall_date").first().attr("title")) ||
      toDcinsideDateTime($(".gall_date").first().text()) ||
      candidate.postedAt,
    viewCount: parseInteger($(".gall_count").first().text()) ?? candidate.viewCount ?? null,
    likeCount:
      parseInteger($(".gall_reply_num").first().text()) ?? candidate.likeCount ?? null,
    dislikeCount: null,
    commentCount:
      commentResult.totalCount ??
      parseInteger($("#comment_cnt").first().attr("value")) ??
      parseInteger($(".gall_comment a").first().text()) ??
      commentResult.comments.length,
    bodyText: textFromElement($, $(".write_div").first()),
    comments: commentResult.comments,
  };
}

const dcinside: SiteAdapter = {
  id: "dcinside",
  displayName: "디시인사이드",
  buildSearchUrl: buildKeywordSearchUrl,
  fetchPostDetail,
  fetchSearchPage,
};

export default dcinside;
