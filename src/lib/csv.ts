import fs from "node:fs";
import path from "node:path";

import { stringify } from "csv-stringify/sync";

import { commentsToText, joinMultivalue } from "./common";

import type { PostRecord } from "../types";

export function writePostsCsv(posts: PostRecord[], outputPath: string): void {
  const rows = posts.map((post) => ({
    site: post.site,
    post_id: post.postId,
    board_code: post.boardCode || "",
    board_name: post.boardName || "",
    category_name: post.categoryName || "",
    title: post.title || "",
    author: post.author || "",
    posted_at: post.postedAt || "",
    url: post.url || "",
    view_count: post.viewCount ?? "",
    like_count: post.likeCount ?? "",
    dislike_count: post.dislikeCount ?? "",
    comment_count: post.commentCount ?? "",
    matched_queries: joinMultivalue(post.matchedQueries),
    matched_search_urls: joinMultivalue(post.matchedSearchUrls),
    search_pages: joinMultivalue(post.searchPages.map(String)),
    search_excerpt: post.searchExcerpt || "",
    body_text: post.bodyText || "",
    comments_text: commentsToText(post.comments),
    comments_json: JSON.stringify(post.comments || []),
    crawl_status: post.crawlStatus || "ok",
    crawl_error: post.crawlError || "",
  }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stringify(rows, { header: true }), "utf8");
}
