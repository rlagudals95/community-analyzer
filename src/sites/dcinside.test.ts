import { describe, it } from "node:test";
import assert from "node:assert/strict";

import dcinside from "./dcinside";

import type { CrawlerTools, SearchQuery } from "../types";

describe("dcinside adapter", () => {
  it("builds search URLs from Korean keywords using DCInside dot-hex encoding", () => {
    assert.equal(
      dcinside.buildSearchUrl?.("정수기 렌탈", "latest"),
      "https://search.dcinside.com/post/sort/latest/q/.EC.A0.95.EC.88.98.EA.B8.B0.20.EB.A0.8C.ED.83.88",
    );

    assert.equal(
      dcinside.buildSearchUrl?.("비데 렌탈", "accuracy"),
      "https://search.dcinside.com/post/sort/accuracy/q/.EB.B9.84.EB.8D.B0.20.EB.A0.8C.ED.83.88",
    );
  });

  it("parses search result rows and requests the expected pagination URL", async () => {
    const requestedUrls: string[] = [];
    const tools: CrawlerTools = {
      async fetchHtml(url: string): Promise<string> {
        requestedUrls.push(url);
        return `
          <ul class="sch_result_list">
            <li>
              <a class="tit_txt" href="https://gall.dcinside.com/mgallery/board/view/?id=cleanwater&no=1118">
                정수기 렌탈 카드 할인이 헷갈립니다
              </a>
              <p class="link_dsc_txt">렌탈료랑 사은품 구조가 너무 복잡해요.</p>
              <p class="link_dsc_txt dsc_sub">
                <a class="sub_txt">정수기 갤러리</a>
                <span class="date_time">2026.06.20 01:37</span>
              </p>
            </li>
          </ul>
          <div class="bottom_paging_box">
            <a href="/post/p/3/sort/latest/q/.EC.A0.95">3</a>
          </div>
        `;
      },
      async postForm(): Promise<string> {
        return "{}";
      },
    };
    const query: SearchQuery = {
      label: "정수기 렌탈",
      searchUrl:
        "https://search.dcinside.com/post/sort/latest/q/.EC.A0.95.EC.88.98.EA.B8.B0.20.EB.A0.8C.ED.83.88",
    };

    const result = await dcinside.fetchSearchPage(query, 2, tools);

    assert.equal(
      requestedUrls[0],
      "https://search.dcinside.com/post/p/2/sort/latest/q/.EC.A0.95.EC.88.98.EA.B8.B0.20.EB.A0.8C.ED.83.88",
    );
    assert.equal(result.hasNextPage, true);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0], {
      site: "dcinside",
      postId: "mgallery:cleanwater:1118",
      url: "https://gall.dcinside.com/mgallery/board/view/?id=cleanwater&no=1118",
      boardCode: "cleanwater",
      boardName: "정수기 갤러리",
      title: "정수기 렌탈 카드 할인이 헷갈립니다",
      author: null,
      postedAt: "2026-06-20 01:37:00",
      viewCount: null,
      likeCount: null,
      commentCount: null,
      searchExcerpt: "렌탈료랑 사은품 구조가 너무 복잡해요.",
      matchedQueries: ["정수기 렌탈"],
      matchedSearchUrls: [query.searchUrl],
      searchPages: [2],
    });
  });

  it("uses the post year for DCInside short-form comment dates", async () => {
    const tools: CrawlerTools = {
      async fetchHtml(): Promise<string> {
        return `
          <script>var _GALLERY_TYPE_ = "M";</script>
          <input type="hidden" id="gallery_id" value="cleanwater" />
          <input type="hidden" id="no" value="1118" />
          <input type="hidden" id="e_s_n_o" value="encrypted" />
          <input type="hidden" id="secret_article_key" value="" />
          <script>
            $(document).data('comment_id', 'cleanwater');
            $(document).data('comment_no', '1118');
          </script>
          <span class="title_subject">정수기 렌탈을 업체에서 하면 장점이 뭐야?</span>
          <span class="gall_writer ub-writer" data-nick="정갤러"></span>
          <span class="gall_date" title="2026-06-20 01:37:39"></span>
          <span class="gall_count">조회 27</span>
          <span class="gall_reply_num">추천 0</span>
          <input id="comment_cnt" value="1" />
          <div class="write_div">본문입니다.</div>
        `;
      },
      async postForm(): Promise<string> {
        return JSON.stringify({
          total_cnt: 1,
          comments: [
            {
              no: "19392",
              name: "정갤러1",
              reg_date: "06.18 16:00:07",
              depth: 0,
              memo: "댓글입니다.",
            },
          ],
        });
      },
    };

    const detail = await dcinside.fetchPostDetail(
      {
        site: "dcinside",
        postId: "mgallery:cleanwater:1118",
        url: "https://gall.dcinside.com/mgallery/board/view/?id=cleanwater&no=1118",
        boardCode: "cleanwater",
        boardName: "정수기 갤러리",
        postedAt: "2026-06-20 01:37:39",
        matchedQueries: ["정수기 렌탈"],
        matchedSearchUrls: [],
        searchPages: [1],
      },
      tools,
    );

    assert.equal(detail.comments[0]?.postedAt, "2026-06-18 16:00:07");
  });
});
