export interface RawPostRow {
  site: string;
  post_id: string;
  board_code: string;
  board_name: string;
  category_name: string;
  title: string;
  author: string;
  posted_at: string;
  url: string;
  view_count: string;
  like_count: string;
  dislike_count: string;
  comment_count: string;
  matched_queries: string;
  matched_search_urls: string;
  search_pages: string;
  search_excerpt: string;
  body_text: string;
  comments_text: string;
  comments_json: string;
  crawl_status: string;
  crawl_error: string;
}

export type IrrelevantReason =
  | ""
  | "non_water_purifier"
  | "news_or_investor"
  | "promotional_or_deal"
  | "generic_rental_chatter"
  | "non_consumer_context"
  | "insufficient_signal";

export type JourneyStage =
  | "탐색/비교"
  | "가입 직전"
  | "설치 검토"
  | "사용 중"
  | "문제 발생"
  | "해지/교체"
  | "후기/평가"
  | "";

export type IntentType =
  | "비교 검토"
  | "추천 요청"
  | "비용 확인"
  | "설치 상담"
  | "계약/해지 상담"
  | "불만 토로"
  | "후기 공유"
  | "";

export type PainPoint =
  | ""
  | "가격 부담"
  | "가격/혜택 구조 불투명"
  | "상품 비교 어려움"
  | "과도한 영업/불신"
  | "계약기간/위약금"
  | "설치 적합성"
  | "위생/관리 불안"
  | "A/S·관리 불만"
  | "교체·해지 번거로움";

export type Severity = "" | "낮음" | "중간" | "높음";

export type Sentiment = "" | "부정" | "중립" | "긍정" | "혼합";

export type SegmentCandidate =
  | ""
  | "가성비 비교형"
  | "불신 회피형"
  | "위생·관리 민감형"
  | "설치 제약형"
  | "해지·갈아타기형";

export interface LabeledPostRow extends RawPostRow {
  is_relevant: "true" | "false";
  irrelevant_reason: IrrelevantReason;
  journey_stage: JourneyStage;
  intent_type: IntentType;
  primary_pain_point: PainPoint;
  secondary_pain_point: PainPoint;
  severity: Severity;
  sentiment: Sentiment;
  segment_candidate: SegmentCandidate;
  evidence_quote: string;
}

export interface PainPointSummary {
  painPoint: Exclude<PainPoint, "">;
  count: number;
  share: number;
  topQuote: string;
}

export interface SegmentSummary {
  segment: Exclude<SegmentCandidate, "">;
  count: number;
  share: number;
  topPainPoints: Array<Exclude<PainPoint, "">>;
  journeyMix: Record<string, number>;
  negativeRate: number;
  averageSeverity: number;
  evidence: string;
}

export interface BeachheadScore {
  segment: Exclude<SegmentCandidate, "">;
  count: number;
  burningPain: number;
  willingnessToPay: number;
  winnability: number;
  referralPotential: number;
  total: number;
  rationale: string;
}

export interface AnalysisSummary {
  totalRows: number;
  relevantRows: number;
  irrelevantRows: number;
  irrelevantBreakdown: Record<string, number>;
  topPainPoints: PainPointSummary[];
  segments: SegmentSummary[];
  beachheadScores: BeachheadScore[];
  recommendedBeachhead: BeachheadScore | null;
  topMvpProblems: Array<Exclude<PainPoint, "">>;
}
