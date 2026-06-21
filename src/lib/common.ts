import * as cheerio from "cheerio";
import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { AnyNode } from "domhandler";

import type { CommentRecord, PostCandidate } from "../types";

dayjs.extend(customParseFormat);

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
export const DEFAULT_CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

type MaybeValue<T> = T | null | undefined | "";

export async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function normalizeInlineText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMultilineText(value: string | null | undefined): string {
  const lines = String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim());

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function htmlToText(html: string | null | undefined): string {
  const prepared = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/blockquote>/gi, "\n")
    .replace(/<\/pre>/gi, "\n");
  const $ = cheerio.load(`<div id="root">${prepared}</div>`);
  return normalizeMultilineText($("#root").text());
}

export function textFromElement(
  $: cheerio.CheerioAPI,
  element: cheerio.BasicAcceptedElems<AnyNode>,
): string {
  return normalizeMultilineText(htmlToText($(element).html() || ""));
}

export function toAbsoluteUrl(
  baseUrl: string,
  href: string | null | undefined,
): string | null {
  if (!href) {
    return null;
  }

  return new URL(href, baseUrl).toString();
}

export function canonicalizeUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

export function parseInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).replace(/[^\d-]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseDate(
  value: string | Date | Dayjs | null | undefined,
): Dayjs | null {
  if (!value) {
    return null;
  }

  if (dayjs.isDayjs(value)) {
    return value;
  }

  const raw = String(value).trim();
  const formats = [
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD HH:mm",
    "YYYY.MM.DD HH:mm:ss",
    "YYYY.MM.DD HH:mm",
    "YYYY.MM.DD",
    "YYYY-MM-DD",
    "YY-MM-DD HH:mm:ss",
    "YY-MM-DD HH:mm",
    "YY-MM-DD",
  ];

  for (const format of formats) {
    const parsed = dayjs(raw, format, true);
    if (parsed.isValid()) {
      return parsed;
    }
  }

  const fallback = dayjs(raw);
  return fallback.isValid() ? fallback : null;
}

export function toDateTimeString(
  value: string | Date | Dayjs | null | undefined,
): string | null {
  const parsed = dayjs.isDayjs(value) ? value : parseDate(value);
  if (!parsed || !parsed.isValid()) {
    return null;
  }

  return parsed.format("YYYY-MM-DD HH:mm:ss");
}

export function isBeforeCutoff(
  value: string | Date | Dayjs | null | undefined,
  cutoffDate: Dayjs,
): boolean {
  const parsed = dayjs.isDayjs(value) ? value : parseDate(value);
  if (!parsed || !parsed.isValid()) {
    return false;
  }

  return parsed.isBefore(cutoffDate);
}

export function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function dedupeNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => value !== null && value !== undefined))];
}

export function joinMultivalue(values: Array<string | null | undefined>): string {
  return dedupeStrings(values).join(" | ");
}

export function commentsToText(comments: CommentRecord[] | null | undefined): string {
  return (comments || [])
    .map((comment) => {
      const parts = [
        `depth=${comment.depth ?? 0}`,
        comment.postedAt ? `at=${comment.postedAt}` : null,
        comment.author ? `author=${comment.author}` : null,
        comment.likeCount !== null && comment.likeCount !== undefined
          ? `likes=${comment.likeCount}`
          : null,
      ].filter(Boolean);

      return `[${parts.join(" ")}] ${comment.bodyText || ""}`.trim();
    })
    .join("\n");
}

function pickPreferred<T>(
  current: MaybeValue<T>,
  fallback: MaybeValue<T>,
): T | null | undefined {
  if (current !== undefined && current !== null && current !== "") {
    return current;
  }

  if (fallback !== undefined && fallback !== null && fallback !== "") {
    return fallback;
  }

  return null;
}

export function mergeCandidate(
  base: PostCandidate | undefined,
  incoming: PostCandidate,
): PostCandidate {
  const baseExcerpt = base?.searchExcerpt || null;
  const incomingExcerpt = incoming.searchExcerpt || null;

  return {
    ...incoming,
    ...base,
    boardCode: pickPreferred(base?.boardCode, incoming.boardCode),
    boardName: pickPreferred(base?.boardName, incoming.boardName),
    categoryName: pickPreferred(base?.categoryName, incoming.categoryName),
    title: pickPreferred(base?.title, incoming.title),
    author: pickPreferred(base?.author, incoming.author),
    postedAt: pickPreferred(base?.postedAt, incoming.postedAt),
    viewCount: pickPreferred(base?.viewCount, incoming.viewCount),
    likeCount: pickPreferred(base?.likeCount, incoming.likeCount),
    dislikeCount: pickPreferred(base?.dislikeCount, incoming.dislikeCount),
    commentCount: pickPreferred(base?.commentCount, incoming.commentCount),
    searchExcerpt:
      incomingExcerpt && (!baseExcerpt || incomingExcerpt.length > baseExcerpt.length)
        ? incomingExcerpt
        : baseExcerpt,
    matchedQueries: dedupeStrings([
      ...(base?.matchedQueries ?? []),
      ...incoming.matchedQueries,
    ]),
    matchedSearchUrls: dedupeStrings([
      ...(base?.matchedSearchUrls ?? []),
      ...incoming.matchedSearchUrls,
    ]),
    searchPages: dedupeNumbers([...(base?.searchPages ?? []), ...incoming.searchPages]).sort(
      (left, right) => left - right,
    ),
  };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
