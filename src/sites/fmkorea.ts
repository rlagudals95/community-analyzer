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

const BASE_URL = "https://www.fmkorea.com";

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

    return tools.fetchRenderedHtml("fmkorea", url, selector);
  }
}

function buildKeywordSearchUrl(keyword: string, sort: SearchSort): string {
  const url = new URL("/search.php", BASE_URL);
  url.searchParams.set("mid", "home");
  url.searchParams.set("act", "IS");
  url.searchParams.set("where", "document");
  url.searchParams.set("is_keyword", keyword);

  if (sort === "accuracy" || sort === "relevance") {
    url.searchParams.set("sph_sort", "relevance");
  }

  return url.toString();
}

function buildSearchPageUrl(query: SearchQuery, pageNumber: number): string {
  const url = new URL(query.searchUrl);
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

async function fetchSearchPage(
  query: SearchQuery,
  pageNumber: number,
  tools: CrawlerTools,
): Promise<SearchPageResult> {
  const url = buildSearchPageUrl(query, pageNumber);
  const html = await loadHtml(url, tools, "ul.searchResult > li");
  const $ = load(html);

  const items: PostCandidate[] = $("ul.searchResult > li")
    .toArray()
    .flatMap((element) => {
      const link = $("dt > a", element).first();
      const rawTitle = normalizeInlineText(link.text());
      const boardMatch = rawTitle.match(/^\[(.+?)\]\s*(.+)$/);
      const boardName = boardMatch ? boardMatch[1] : null;
      const title = boardMatch ? boardMatch[2] : rawTitle;
      const href = link.attr("href");
      const absoluteUrl = canonicalizeUrl(toAbsoluteUrl(BASE_URL, href));
      const postId = absoluteUrl ? new URL(absoluteUrl).pathname.slice(1) : null;

      if (!postId || !absoluteUrl) {
        return [];
      }

      return [{
        site: "fmkorea" as const,
        postId,
        url: absoluteUrl,
        boardName,
        title,
        author: normalizeInlineText($("address > strong", element).text()) || null,
        postedAt: toDateTimeString($(".time", element).first().text()),
        likeCount: parseInteger($(".recomNum", element).first().text()),
        commentCount: parseInteger($(".reply em", element).first().text()),
        searchExcerpt: normalizeInlineText($("dd", element).text()) || null,
        matchedQueries: [query.label],
        matchedSearchUrls: [query.searchUrl],
        searchPages: [pageNumber],
      }];
    });

  const hasNextPage =
    $(`.pagination a[href*="page=${pageNumber + 1}"]`).length > 0;

  return { items, hasNextPage };
}

async function fetchPostDetail(
  candidate: PostCandidate,
  tools: CrawlerTools,
): Promise<PostDetail> {
  const html = await loadHtml(candidate.url, tools, ".rd_body article .xe_content");
  const $ = load(html);

  const boardName =
    candidate.boardName || normalizeInlineText($(".bd_tl h1 a").first().text()) || null;
  const categoryName =
    normalizeInlineText($(".pop_more .category").first().text()) || null;

  const counts = $(".btm_area .side.fr span")
    .toArray()
    .reduce<{ viewCount?: number | null; likeCount?: number | null; commentCount?: number | null }>(
      (accumulator, element) => {
        const text = normalizeInlineText($(element).text());
        if (text.includes("조회 수")) {
          accumulator.viewCount = parseInteger(text);
        } else if (text.includes("추천 수")) {
          accumulator.likeCount = parseInteger(text);
        } else if (text.includes("댓글")) {
          accumulator.commentCount = parseInteger(text);
        }
        return accumulator;
      },
      {},
    );

  const comments: CommentRecord[] = $(".fdb_lst_ul > li.fdb_itm")
    .toArray()
    .flatMap((element) => {
      const style = $(element).attr("style") || "";
      const depthMatch = style.match(/margin-left:(\d+)%/);
      const commentId = ($(element).attr("id") || "").replace(/^comment_/, "");

      if (!commentId) {
        return [];
      }

      return [{
        commentId,
        author: normalizeInlineText($(".meta a.member_plate", element).text()) || null,
        postedAt: toDateTimeString($(".meta .date", element).text()),
        likeCount: parseInteger($(".voted_count", element).first().text()),
        depth: depthMatch
          ? Number(depthMatch[1]) / 2
          : $(element).hasClass("re")
            ? 1
            : 0,
        bodyText: textFromElement($, $(".comment-content .xe_content", element).first()),
      }];
    });

  return {
    site: "fmkorea",
    postId: candidate.postId,
    url: candidate.url,
    boardCode: null,
    boardName,
    categoryName,
    title:
      normalizeInlineText($(".rd_hd .np_18px_span").first().text()) || candidate.title || null,
    author:
      normalizeInlineText($(".btm_area .side a.member_plate").first().text()) ||
      candidate.author ||
      null,
    postedAt: toDateTimeString($(".top_area .date").first().text()) || candidate.postedAt,
    viewCount: counts.viewCount ?? null,
    likeCount: counts.likeCount ?? candidate.likeCount ?? null,
    dislikeCount: null,
    commentCount: counts.commentCount ?? comments.length,
    bodyText: textFromElement($, $(".rd_body article .xe_content").first()),
    comments,
  };
}

const fmkorea: SiteAdapter = {
  id: "fmkorea",
  displayName: "에펨코리아",
  buildSearchUrl: buildKeywordSearchUrl,
  fetchPostDetail,
  fetchSearchPage,
};

export default fmkorea;
