# community-analyzer

렌탈 시장 사용자 페인포인트 분석용 커뮤니티 크롤러입니다.

TypeScript로 작성되어 있고, 개발 실행은 `tsx`, 배포용 빌드는 `tsc`를 사용합니다.

현재 지원 사이트:
- 에펨코리아
- 클리앙
- 아카라이브
- 디시인사이드

수집 항목:
- 사이트 / 게시판 / 말머리
- 게시글 제목
- 작성자
- 작성일
- 조회수
- 좋아요수 / 추천수
- 댓글수
- 게시글 본문
- 댓글 전체
- 어떤 검색어에서 매칭됐는지

기본 검색어 설정:
- 정수기 렌탈
- 비데 렌탈
- 공기청정기 렌탈

아카라이브 기본 설정은 현재 `정수기 렌탈`만 포함되어 있습니다. `--keyword` 또는
`--keywords`를 쓰면 지원 사이트별 검색 URL을 자동 생성합니다.

## 설치

```bash
npm install
```

## 실행

개발 실행 전 타입 검사:

```bash
npm run typecheck
```

자주 쓰는 npm scripts:

```bash
npm run crawl:help     # 크롤러 옵션 확인
npm run check          # 타입체크 + 테스트
npm run validate       # clean + check + build
npm run clean          # dist 제거
npm run clean:output   # smoke/test/테스트 CSV 제거
```

빌드:

```bash
npm run build
```

기본 실행:

```bash
npm run crawl -- --cutoff-date=2025-01-01
```

주요 옵션:

```bash
--site=fmkorea,clien,arca,dcinside
--keyword="정수기 렌탈"
--keywords="정수기 렌탈,비데 렌탈,공기청정기 렌탈"
--sort=latest
--cutoff-date=2025-01-01
--until-date=2025-01-01
--output=output/rental-community-posts.csv
--delay-ms=800
--max-pages=200
--pages=3
--headed
--chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

예시:

```bash
npm run crawl -- --site=arca --cutoff-date=2025-01-01 --headed
```

키워드, 페이지 수, 날짜 기준으로 수집:

```bash
npm run crawl -- \
  --site=fmkorea,clien,dcinside \
  --keywords="정수기 렌탈,비데 렌탈,공기청정기 렌탈" \
  --sort=latest \
  --until-date=2025-01-01 \
  --pages=3 \
  --output=output/렌탈_커뮤니티_3페이지.csv
```

정확도/관련도 순으로 페이지 수만큼 수집:

```bash
npm run crawl -- \
  --site=fmkorea,clien,dcinside \
  --keyword="정수기 렌탈" \
  --sort=accuracy \
  --no-cutoff \
  --pages=31 \
  --output=output/정수기렌탈_정확도순_31페이지.csv
```

## 출력

기본 출력 파일:

`output/rental-community-posts.csv`

CSV 주요 컬럼:
- `site`
- `post_id`
- `board_name`
- `category_name`
- `title`
- `author`
- `posted_at`
- `view_count`
- `like_count`
- `comment_count`
- `matched_queries`
- `body_text`
- `comments_text`
- `comments_json`
- `crawl_status`
- `crawl_error`

## 참고

- 에펨코리아는 빠른 연속 요청 시 `HTTP 430`이 날 수 있어서, HTTP 요청 실패 시 브라우저 렌더링으로 자동 폴백합니다.
- 클리앙은 브라우저형 User-Agent로 접근합니다.
- 아카라이브는 시스템 Chrome + Playwright를 사용합니다.
- 아카라이브 페이지네이션은 현재 확인 기준으로 `p=2`가 두 번째 페이지입니다. 첫 페이지는 파라미터가 없거나 `p=1`이어도 같은 결과가 나옵니다.
- 디시인사이드는 검색 결과 URL의 dot-hex 인코딩을 자동 생성하고, 댓글은 상세 페이지의 `/board/comment/` API를 호출해 수집합니다.
- 접근이 막히거나 삭제된 글은 CSV에 `crawl_status=detail_failed`로 남습니다.
