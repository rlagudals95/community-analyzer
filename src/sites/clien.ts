import { load } from "cheerio";

import {
  canonicalizeUrl,
  normalizeInlineText,
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

const BASE_URL = "https://www.clien.net";

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

    return tools.fetchRenderedHtml("clien", url, selector);
  }
}

function buildKeywordSearchUrl(keyword: string, sort: SearchSort): string {
  const url = new URL("/service/search", BASE_URL);
  url.searchParams.set("q", keyword);
  url.searchParams.set(
    "sort",
    sort === "accuracy" || sort === "relevance" ? "accuracy" : "recency",
  );
  url.searchParams.set("boardCd", "");
  url.searchParams.set("isBoard", "false");
  return url.toString();
}

function buildSearchPageUrl(query: SearchQuery, pageNumber: number): string {
  const url = new URL(query.searchUrl);
  if (pageNumber <= 1) {
    url.searchParams.delete("p");
  } else {
    url.searchParams.set("p", String(pageNumber - 1));
  }

  return url.toString();
}

function extractBoardCode(url: string): string | null {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  return segments[2] || null;
}

async function fetchSearchPage(
  query: SearchQuery,
  pageNumber: number,
  tools: CrawlerTools,
): Promise<SearchPageResult> {
  const url = buildSearchPageUrl(query, pageNumber);
  const html = await loadHtml(url, tools, ".contents_jirum.total_search .list_item");
  const $ = load(html);

  const items: PostCandidate[] = $(".contents_jirum.total_search .list_item[data-role='list-row']")
    .toArray()
    .flatMap((element) => {
      const link = $("a.subject_fixed", element).first();
      const absoluteUrl = canonicalizeUrl(toAbsoluteUrl(BASE_URL, link.attr("href")));
      const postId = parseInteger($(element).attr("data-board-sn"));

      if (!postId || !absoluteUrl) {
        return [];
      }

      return [{
        site: "clien" as const,
        postId: String(postId),
        url: absoluteUrl,
        boardCode: extractBoardCode(absoluteUrl),
        boardName:
          normalizeInlineText($("button.shortname.fixed", element).text()) || null,
        title: normalizeInlineText(link.attr("title") || link.text()) || null,
        author:
          normalizeInlineText(
            $(".list_author .nickname [title]", element).attr("title"),
          ) ||
          normalizeInlineText($(".list_author .nickname", element).text()) ||
          null,
        postedAt:
          toDateTimeString($(".list_time .timestamp", element).first().text()) ||
          toDateTimeString($(".list_time .time", element).first().text()),
        viewCount: parseInteger($(".list_hit .hit", element).first().text()),
        likeCount: parseInteger($(".list_symph", element).first().text()),
        commentCount:
          parseInteger($(element).attr("data-comment-count")) ||
          parseInteger($(".list_reply", element).first().text()),
        searchExcerpt: normalizeInlineText($(".preview", element).text()) || null,
        matchedQueries: [query.label],
        matchedSearchUrls: [query.searchUrl],
        searchPages: [pageNumber],
      }];
    });

  const currentIndex = pageNumber - 1;
  const hasNextPage = $(".board-pagination [onclick]")
    .toArray()
    .some((element) => {
      const onclick = $(element).attr("onclick") || "";
      const match = onclick.match(/"(\d+)"/);
      return match ? Number(match[1]) > currentIndex : false;
    });

  return { items, hasNextPage };
}

async function fetchPostDetail(
  candidate: PostCandidate,
  tools: CrawlerTools,
): Promise<PostDetail> {
  const html = await loadHtml(candidate.url, tools, ".post_view .post_article");
  const $ = load(html);

  const comments: CommentRecord[] = $(".comment_row[data-role='comment-row']")
    .toArray()
    .flatMap((element) => {
      const commentId = String($(element).attr("data-comment-sn") || "");
      if (!commentId) {
        return [];
      }

      return [{
        commentId,
        author:
          normalizeInlineText($(".contact_name [itemprop='name']", element).first().text()) ||
          normalizeInlineText($(".nickname [title]", element).first().attr("title")) ||
          normalizeInlineText($(".nickname", element).first().text()) ||
          null,
        postedAt:
          toDateTimeString($(".comment_time .timestamp", element).first().attr("datetime")) ||
          toDateTimeString($(".comment_time .timestamp", element).first().text()),
        likeCount: parseInteger($("strong[id^='setLikeCount_']", element).first().text()),
        depth: $(element).hasClass("re") ? 1 : 0,
        bodyText: textFromElement($, $(".comment_view", element).first()),
      }];
    });

  return {
    site: "clien",
    postId: candidate.postId,
    url: candidate.url,
    boardCode: candidate.boardCode,
    boardName: candidate.boardName,
    categoryName: null,
    title:
      normalizeInlineText($(".post_title .post_subject > span").first().text()) ||
      candidate.title ||
      null,
    author:
      normalizeInlineText($(".post_info .contact_name [itemprop='name']").first().text()) ||
      candidate.author ||
      null,
    postedAt:
      toDateTimeString(
        $(".post_author .view_count.date [itemprop='datePublished']").first().text(),
      ) ||
      toDateTimeString($(".post_author .view_count.date").first().attr("datetime")) ||
      candidate.postedAt,
    viewCount: parseInteger($(".post_author .view_count strong").first().text()),
    likeCount: parseInteger($(".post_button .symph_count strong").first().text()),
    dislikeCount: null,
    commentCount:
      parseInteger($(".post_comment .comment_head strong").first().text()) || comments.length,
    bodyText: textFromElement($, $(".post_article").first()),
    comments,
  };
}

const clien: SiteAdapter = {
  id: "clien",
  displayName: "클리앙",
  buildSearchUrl: buildKeywordSearchUrl,
  fetchPostDetail,
  fetchSearchPage,
};

export default clien;
