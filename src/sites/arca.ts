import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

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

const BASE_URL = "https://arca.live";

function stripReadMore(text: string | null | undefined): string {
  return String(text || "").replace(/\n?펼쳐보기▼\s*$/u, "").trim();
}

function extractTitleText(titleElement: Cheerio<AnyNode>): string {
  const clone = titleElement.clone();
  clone.find(".badge").remove();
  return normalizeInlineText(clone.text());
}

function buildKeywordSearchUrl(keyword: string, _sort: SearchSort): string {
  const url = new URL("/b/breaking", BASE_URL);
  url.searchParams.set("keyword", keyword);
  return url.toString();
}

function buildSearchPageUrl(query: SearchQuery, pageNumber: number): string {
  const url = new URL(query.searchUrl);
  if (pageNumber <= 1) {
    url.searchParams.delete("p");
  } else {
    url.searchParams.set("p", String(pageNumber));
  }

  return url.toString();
}

function extractBoardCode(url: string): string | null {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  return segments[1] || null;
}

async function fetchSearchPage(
  query: SearchQuery,
  pageNumber: number,
  tools: CrawlerTools,
): Promise<SearchPageResult> {
  if (!tools.fetchRenderedHtml) {
    throw new Error("Arca crawler requires fetchRenderedHtml support.");
  }

  const url = buildSearchPageUrl(query, pageNumber);
  const html = await tools.fetchRenderedHtml("arca", url, ".article-list a.vrow.column");
  const $ = load(html);

  const boardName =
    normalizeInlineText($(".board-title .title span[title]").first().text()) ||
    "종합 속보";

  const items: PostCandidate[] = $(".article-list a.vrow.column")
    .not(".notice")
    .toArray()
    .flatMap((element) => {
      const absoluteUrl = canonicalizeUrl(toAbsoluteUrl(BASE_URL, $(element).attr("href")));
      const pathSegments = absoluteUrl
        ? new URL(absoluteUrl).pathname.split("/").filter(Boolean)
        : [];
      const badges = $(".badges .badge", element)
        .toArray()
        .map((badge) => normalizeInlineText($(badge).text()))
        .filter(Boolean);

      if (!pathSegments[2] || !absoluteUrl) {
        return [];
      }

      return [{
        site: "arca" as const,
        postId: pathSegments[2],
        url: absoluteUrl,
        boardCode: pathSegments[1] || "breaking",
        boardName,
        categoryName: badges[0] || null,
        title: extractTitleText($(".title", element).first()) || null,
        author:
          normalizeInlineText($(".col-author [data-filter]", element).first().text()) ||
          null,
        postedAt:
          toDateTimeString($(".col-time time", element).first().attr("datetime")) ||
          toDateTimeString($(".col-time time", element).first().text()),
        viewCount: parseInteger($(".col-view", element).first().text()),
        likeCount: parseInteger($(".col-rate", element).first().text()),
        commentCount: parseInteger($(".comment-count", element).first().text()),
        searchExcerpt: normalizeInlineText($(".vrow-preview", element).text()) || null,
        matchedQueries: [query.label],
        matchedSearchUrls: [query.searchUrl],
        searchPages: [pageNumber],
      }];
    });

  const hasNextPage =
    $(`.pagination-wrapper a.page-link[href*="p=${pageNumber + 1}"]`).length > 0;

  return { items, hasNextPage };
}

async function fetchPostDetail(
  candidate: PostCandidate,
  tools: CrawlerTools,
): Promise<PostDetail> {
  if (!tools.fetchRenderedHtml) {
    throw new Error("Arca crawler requires fetchRenderedHtml support.");
  }

  const html = await tools.fetchRenderedHtml(
    "arca",
    candidate.url,
    ".article-wrapper .article-head",
  );
  const $ = load(html);

  const infoValues = $(".article-info.article-info-section")
    .children()
    .toArray()
    .reduce<{
      likeCount?: number | null;
      dislikeCount?: number | null;
      commentCount?: number | null;
      viewCount?: number | null;
    }>((accumulator, element, index, array) => {
      const text = normalizeInlineText($(element).text());
      if ($(element).hasClass("head")) {
        const next = array[index + 1];
        const valueText = normalizeInlineText($(next).text());

        if (text === "추천") {
          accumulator.likeCount = parseInteger(valueText);
        } else if (text === "비추천") {
          accumulator.dislikeCount = parseInteger(valueText);
        } else if (text === "댓글") {
          accumulator.commentCount = parseInteger(valueText);
        } else if (text === "조회수") {
          accumulator.viewCount = parseInteger(valueText);
        }
      }

      return accumulator;
    }, {});

  const comments: CommentRecord[] = $(".comment-item")
    .toArray()
    .flatMap((element) => {
      const commentId = ($(element).attr("id") || "").replace(/^c_/, "");
      if (!commentId) {
        return [];
      }

      return [{
        commentId,
        author:
          normalizeInlineText($(".user-info [data-filter]", element).first().text()) || null,
        postedAt:
          toDateTimeString($("time", element).first().attr("datetime")) ||
          toDateTimeString($("time", element).first().text()),
        likeCount: null,
        depth: $(".info-row > a[href*='#c_']", element).length > 0 ? 1 : 0,
        bodyText: stripReadMore(textFromElement($, $(".message", element).first())),
      }];
    });

  return {
    site: "arca",
    postId: candidate.postId,
    url: candidate.url,
    boardCode: candidate.boardCode || extractBoardCode(candidate.url),
    boardName:
      candidate.boardName ||
      normalizeInlineText($(".board-title .title span[title]").first().text()) ||
      "종합 속보",
    categoryName:
      normalizeInlineText($(".article-head .category-badge").first().text()) ||
      candidate.categoryName ||
      null,
    title: extractTitleText($(".article-head .title").first()) || candidate.title || null,
    author:
      normalizeInlineText($(".article-head .info .user-info [data-filter]").first().text()) ||
      candidate.author ||
      null,
    postedAt:
      toDateTimeString($(".article-info .date time").first().attr("datetime")) ||
      toDateTimeString($(".article-info .date time").first().text()) ||
      candidate.postedAt,
    viewCount: infoValues.viewCount ?? candidate.viewCount ?? null,
    likeCount: infoValues.likeCount ?? candidate.likeCount ?? null,
    dislikeCount: infoValues.dislikeCount ?? null,
    commentCount: infoValues.commentCount ?? comments.length,
    bodyText: stripReadMore(textFromElement($, $(".article-body .article-content").first())),
    comments,
  };
}

const arca: SiteAdapter = {
  id: "arca",
  displayName: "아카라이브",
  buildSearchUrl: buildKeywordSearchUrl,
  fetchPostDetail,
  fetchSearchPage,
};

export default arca;
