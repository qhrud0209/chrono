export type MockEvent = {
  eventId: number,
  keywordId: string,
  eventDateTime: string,
  eventTag?: string,
  eventName: string,
  summary: string,
};

export type MockNews = {
  newsId: number,
  eventId: number,
  media: string,
  headline: string,
  URL: string,
};

const baseDate = (date: string) => `${date} 09:00:00.000`;

export const MOCK_EVENTS: Record<string, MockEvent[]> = {
  '36': [
    {
      eventId: 361,
      keywordId: '36',
      eventDateTime: baseDate('2025-06-02'),
      eventTag: 'launch',
      eventName: 'WWDC25 키노트에서 visionOS 3, iOS 19 발표',
      summary:
        'WWDC 2025 키노트에서 visionOS 3, iOS 19, Apple Intelligence가 공개되었습니다.',
    },
    {
      eventId: 362,
      keywordId: '36',
      eventDateTime: baseDate('2025-06-03'),
      eventTag: 'policy',
      eventName: 'Apple Intelligence API 문서 배포',
      summary:
        'Apple Intelligence API 문서와 샘플 프로젝트가 배포되어 개발자 실험이 본격화되었습니다.',
    },
    {
      eventId: 363,
      keywordId: '36',
      eventDateTime: baseDate('2025-06-08'),
      eventTag: 'policy',
      eventName: '애플 파크 개발자 랩 오픈',
      summary:
        '애플 파크 개발자 랩이 열리며 온디바이스 생성형 기능을 직접 테스트할 수 있게 됐습니다.',
    },
    {
      eventId: 364,
      keywordId: '36',
      eventDateTime: baseDate('2025-06-10'),
      eventTag: 'launch',
      eventName: 'Xcode 17 베타 2 릴리스',
      summary:
        'Xcode 17 베타 2가 공개되며 visionOS 3 대응 RealityKit 업데이트가 포함됐습니다.',
    },
    {
      eventId: 365,
      keywordId: '36',
      eventDateTime: baseDate('2025-06-14'),
      eventTag: 'policy',
      eventName: '카카오・네이버와 파트너십 발표',
      summary:
        '애플은 카카오・네이버와 파트너십을 발표하며 한국어 AI 품질 향상을 약속했습니다.',
    },
    {
      eventId: 366,
      keywordId: '36',
      eventDateTime: baseDate('2025-06-20'),
      eventTag: 'launch',
      eventName: '한국어 온디바이스 LLM 베타 공개',
      summary:
        '한국어 특화 온디바이스 LLM 베타가 공개돼 한국 사용자가 우선 체험하게 됐습니다.',
    },
    {
      eventId: 367,
      keywordId: '36',
      eventDateTime: baseDate('2025-06-24'),
      eventTag: 'policy',
      eventName: 'AI 프라이버시 화이트페이퍼 배포',
      summary:
        'AI 프라이버시 화이트페이퍼가 배포되며 Private Cloud Compute 구조가 설명됐습니다.',
    },
    {
      eventId: 368,
      keywordId: '36',
      eventDateTime: baseDate('2025-07-01'),
      eventTag: 'launch',
      eventName: '첫 서드파티 Apple Intelligence 사례',
      summary:
        '국내 개발사가 Apple Intelligence Summaries API를 활용한 첫 사례를 발표했습니다.',
    },
  ],
};

export const MOCK_NEWS: Record<number, MockNews[]> = {
  361: [
    {
      newsId: 5001,
      eventId: 361,
      media: 'Chrono News',
      headline: 'WWDC25 키노트, Apple Intelligence 전면에',
      URL: 'https://news.example.com/articles/apple-wwdc25-ai',
    },
    {
      newsId: 5002,
      eventId: 361,
      media: 'TechSeoul',
      headline: 'visionOS 3가 이끄는 공간 컴퓨팅 로드맵',
      URL: 'https://tech.example.com/visionos3-preview',
    },
  ],
  362: [
    {
      newsId: 5003,
      eventId: 362,
      media: 'DevStream',
      headline: 'Apple Intelligence API 문서 총정리',
      URL: 'https://dev.example.com/apple-intel-guide',
    },
  ],
  363: [
    {
      newsId: 5004,
      eventId: 363,
      media: 'DevStream',
      headline: '애플 파크 개발자 랩 체험기',
      URL: 'https://dev.example.com/wwdc25-lab',
    },
  ],
  364: [
    {
      newsId: 5005,
      eventId: 364,
      media: 'StackWave',
      headline: 'Xcode 17 베타 2 변경 사항 정리',
      URL: 'https://dev.example.com/xcode17-beta2',
    },
  ],
  365: [
    {
      newsId: 5006,
      eventId: 365,
      media: 'JTBC',
      headline: '애플, 국내 포털과 AI 협력 발표',
      URL: 'https://biz.example.com/apple-korea-ai',
    },
  ],
  366: [
    {
      newsId: 5007,
      eventId: 366,
      media: 'MTN',
      headline: '한국어 온디바이스 LLM 베타 공개',
      URL: 'https://biz.example.com/apple-korean-llm',
    },
  ],
  367: [
    {
      newsId: 5008,
      eventId: 367,
      media: 'SecureStack',
      headline: 'Private Cloud Compute 이해하기',
      URL: 'https://security.example.com/private-cloud-compute',
    },
  ],
  368: [
    {
      newsId: 5009,
      eventId: 368,
      media: 'Chrono News',
      headline: '국내 앱, Apple Intelligence 활용 사례',
      URL: 'https://news.example.com/apple-intel-korea-case',
    },
  ],
};
