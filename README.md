# community-analyzer

렌탈 시장 사용자 페인포인트 분석용 커뮤니티 크롤러입니다.

지원 커뮤니티:
- 에펨코리아
- 클리앙
- 아카라이브
- 디시인사이드

수집 항목:
- 제목, 작성자, 작성일, 게시판
- 조회수, 좋아요수/추천수, 댓글수
- 게시글 본문
- 댓글 전체
- 매칭된 검색어와 검색 페이지

## 설치

```bash
npm install
```

## 가장 자주 쓰는 사용법

특정 키워드를 특정 날짜까지, 최대 N건 수집:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 120
```

의미:
- `정수기 렌탈`: 검색 키워드
- `2025-01-01`: 이 날짜 이전 글은 제외
- `120`: 전체 커뮤니티 합산 최대 저장 글 수

자동 출력 파일:

```text
output/정수기렌탈_2025-01-01까지_120건.csv
```

날짜 제한 없이 최신순으로 N건만 수집:

```bash
npm run crawl -- "인터넷 설치" 50
```

자동 출력 파일:

```text
output/인터넷설치_최신_50건.csv
```

## 제한 기준

전체 합산 N건 제한:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 --max-posts=120
```

커뮤니티별 N건 제한:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 --max-posts-per-site=30
```

둘 다 사용:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 --max-posts=120 --max-posts-per-site=30
```

정리:
- `--max-posts`: 전체 커뮤니티 합산 최대 글 수
- `--limit`: `--max-posts` 별칭
- `--max-posts-per-site`: 커뮤니티별 최대 글 수
- `--site-limit`: `--max-posts-per-site` 별칭

## 사이트 선택

기본값은 4개 커뮤니티 전체입니다.

특정 사이트만 수집:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 100 --site=fmkorea,clien
```

사용 가능한 site id:
- `fmkorea`
- `clien`
- `arca`
- `dcinside`

## 정렬과 페이지

최신순 기본 수집:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 100 --sort=latest
```

정확도/관련도순 수집:

```bash
npm run crawl -- "정수기 렌탈" 100 --sort=accuracy
```

최대 검색 페이지 수 조정:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 100 --pages=10
```

정렬 옵션:
- `latest`: 최신순
- `accuracy`: 정확도순
- `relevance`: 관련도순 alias
- `recency`: 최신순 alias

## 출력 파일 지정

자동 파일명 대신 직접 지정:

```bash
npm run crawl -- "정수기 렌탈" 2025-01-01 120 --output=output/water-rental.csv
```

기본 출력 파일:

```text
output/rental-community-posts.csv
```

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
- `matched_search_urls`
- `search_pages`
- `search_excerpt`
- `body_text`
- `comments_text`
- `comments_json`
- `crawl_status`
- `crawl_error`

## 상세 옵션

```bash
npm run crawl -- [options]
```

주요 옵션:

```bash
--site=fmkorea,clien,arca,dcinside
--keyword="정수기 렌탈"
--keywords="정수기 렌탈,비데 렌탈,공기청정기 렌탈"
--sort=latest
--until-date=2025-01-01
--cutoff-date=2025-01-01
--no-cutoff
--pages=3
--max-pages=3
--max-posts=100
--limit=100
--max-posts-per-site=30
--site-limit=30
--delay-ms=800
--output=output/posts.csv
--headed
--chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

여러 키워드 수집:

```bash
npm run crawl -- \
  --keywords="정수기 렌탈,비데 렌탈,공기청정기 렌탈" \
  --until-date=2025-01-01 \
  --max-posts=300 \
  --output=output/렌탈_3키워드.csv
```

## npm scripts

```bash
npm run crawl:help     # 크롤러 옵션 확인
npm run check          # 타입체크 + 테스트
npm run validate       # clean + check + build
npm run clean          # dist 제거
npm run clean:output   # smoke/test/테스트 CSV 제거
```

환경변수 방식도 지원합니다:

```bash
KEYWORD="정수기 렌탈" \
UNTIL_DATE=2025-01-01 \
MAX_POSTS=120 \
OUTPUT=output/정수기렌탈_2025까지_120건.csv \
npm run crawl:dated
```

```bash
KEYWORD="인터넷 설치" \
MAX_POSTS=50 \
OUTPUT=output/인터넷설치_샘플50건.csv \
npm run crawl:limit
```

## 개발

타입체크:

```bash
npm run typecheck
```

테스트:

```bash
npm test
```

빌드:

```bash
npm run build
```

전체 검증:

```bash
npm run validate
```

## 참고

- `crawl_status=detail_failed`인 행은 검색 결과는 수집됐지만 상세 본문/댓글 수집에 실패한 글입니다.
- 에펨코리아는 빠른 연속 요청 시 `HTTP 430`이 날 수 있어 HTTP 요청 실패 시 브라우저 렌더링으로 자동 폴백합니다.
- 아카라이브는 시스템 Chrome + Playwright를 사용합니다.
- 디시인사이드는 검색 URL의 dot-hex 인코딩을 자동 생성하고, 댓글은 상세 페이지의 `/board/comment/` API로 수집합니다.
