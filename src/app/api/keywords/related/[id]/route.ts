import { NextResponse } from 'next/server';

import { RelatedKeyword } from '@/app/components/topicGraphData';

const MOCK_RELATIONSHIPS: Record<string, RelatedKeyword[]> = {
  36: [
    { keywordName: '아이폰 17', keywordId: 19, relatedness: 0.92 },
    { keywordName: '애플 실리콘 X3', keywordId: 203, relatedness: 0.81 },
    { keywordName: '비전프로 2세대', keywordId: 415, relatedness: 0.77 },
    { keywordName: 'iOS 19 베타', keywordId: 108, relatedness: 0.72 },
    { keywordName: 'XR 생태계', keywordId: 502, relatedness: 0.63 },
    { keywordName: '애플AI 스택', keywordId: 611, relatedness: 0.58 },
    { keywordName: '애플카 프로젝트', keywordId: 48, relatedness: 0.46 },
    { keywordName: 'Swift 언어 로드맵', keywordId: 712, relatedness: 0.41 },
    { keywordName: '앱스토어 수익 모델', keywordId: 903, relatedness: 0.35 },
    { keywordName: '프라이버시 정책', keywordId: 812, relatedness: 0.28 },
    { keywordName: '생태계 락인 전략', keywordId: 721, relatedness: 0.24 },
    { keywordName: '서비스 구독 번들', keywordId: 615, relatedness: 0.18 },
  ],
  19: [
    { keywordName: 'A20 바이오닉', keywordId: 220, relatedness: 0.89 },
    { keywordName: '테트라 프리즘 카메라', keywordId: 331, relatedness: 0.82 },
    { keywordName: '위성 통신 2.0', keywordId: 441, relatedness: 0.76 },
    { keywordName: '티타늄 프레임', keywordId: 552, relatedness: 0.7 },
    { keywordName: '배터리 효율 엔진', keywordId: 663, relatedness: 0.62 },
    { keywordName: 'iOS 19 카메라', keywordId: 774, relatedness: 0.54 },
    { keywordName: '디스플레이 LTPO', keywordId: 885, relatedness: 0.48 },
    { keywordName: '항온 냉각 시스템', keywordId: 996, relatedness: 0.39 },
    { keywordName: '애플펜슬 미니', keywordId: 110, relatedness: 0.31 },
    { keywordName: '프로맥스 수요', keywordId: 2201, relatedness: 0.26 },
    { keywordName: '충전 정책', keywordId: 3302, relatedness: 0.22 },
    { keywordName: '에코시스템 동기화', keywordId: 4403, relatedness: 0.17 },
  ],
};

const FALLBACK_LABELS = [
  '이슈 트렌드',
  '테크 전략',
  '거버넌스',
  '시장 전망',
  '캠페인 라인',
  '공급망',
  '정책 브리핑',
  '성장 로드맵',
  '리스크 맵',
  '신제품 루머',
  '생태계 인사이트',
  '핀테크 연계',
];

const buildFallbackKeywords = (keywordId: string): RelatedKeyword[] =>
  FALLBACK_LABELS.map((label, index) => {
    const baseScore = 0.85 - index * 0.05;
    return {
      keywordName: `${keywordId} · ${label}`,
      keywordId: Number(`${keywordId}${index + 1}`),
      relatedness: Math.max(-1, Math.min(1, Number(baseScore.toFixed(3)))),
    };
  });

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: keywordId } = await context.params;
  const related =
    MOCK_RELATIONSHIPS[keywordId] ?? buildFallbackKeywords(keywordId);

  return NextResponse.json({
    content: related.slice(0, 12),
  });
}
