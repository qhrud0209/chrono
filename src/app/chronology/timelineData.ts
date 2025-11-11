export type TimelineArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
};

export type TimelineEvent = {
  id: string;
  dateLabel: string;
  title: string;
  summary: string;
  articles: TimelineArticle[];
  tag?: 'launch' | 'supply' | 'policy' | 'rumor';
};

export type KeywordTimeline = {
  keywordId: string;
  keywordLabel: string;
  intro: string;
  events: TimelineEvent[];
};

const TIMELINES: Record<string, KeywordTimeline> = {
  '36': {
    keywordId: '36',
    keywordLabel: 'WWDC25',
    intro:
      '애플이 올 해 WWDC에서 발표한 주요 변화와 후속 파장을 시간 순으로 정리했습니다.',
    events: [
      {
        id: '36-1',
        dateLabel: '2025.06.02',
        title: '키노트에서 visionOS 3와 iOS 19 발표',
        summary:
          '애플은 WWDC 2025 키노트에서 visionOS 3, iOS 19, macOS Mammoth 등을 공개하며 생성형 AI 기능을 대거 선보였습니다.',
        tag: 'launch',
        articles: [
          {
            title: 'WWDC25에서 공개된 애플 AI 전략',
            source: 'Chrono News',
            url: 'https://news.example.com/articles/apple-wwdc25-ai',
            publishedAt: '2025-06-02',
          },
          {
            title: 'visionOS 3, 공간 컴퓨팅의 다음 단계',
            source: 'TechSeoul',
            url: 'https://tech.example.com/visionos3-preview',
            publishedAt: '2025-06-03',
          },
        ],
      },
      {
        id: '36-2',
        dateLabel: '2025.06.03',
        title: 'Apple Intelligence 실행 가이드 배포',
        summary:
          '애플은 개발자 포털을 통해 Apple Intelligence API 문서와 데모 프로젝트를 공개하며, 온디바이스 모델을 호출하는 베스트 프랙티스를 안내했습니다.',
        tag: 'policy',
        articles: [
          {
            title: 'Apple Intelligence 통합 가이드 정리',
            source: 'DevStream',
            url: 'https://dev.example.com/apple-intel-guide',
            publishedAt: '2025-06-03',
          },
        ],
      },
      {
        id: '36-3',
        dateLabel: '2025.06.08',
        title: '개발자 랩에서 최신 SDK 체험 시작',
        summary:
          '애플 파크 개발자 랩이 열리며 시연 단말과 샘플 코드가 공개되어, 국내외 주요 앱사들이 생성형 기능을 빠르게 테스트하기 시작했습니다.',
        tag: 'policy',
        articles: [
          {
            title: '애플 파크 개발자 랩 후기 모음',
            source: 'DevStream',
            url: 'https://dev.example.com/wwdc25-lab',
            publishedAt: '2025-06-08',
          },
        ],
      },
      {
        id: '36-4',
        dateLabel: '2025.06.10',
        title: 'Xcode 17 베타 2 릴리스',
        summary:
          'Xcode 17 베타 2가 공개되며 Apple Intelligence 시뮬레이터, visionOS 3용 RealityKit 기능이 대거 추가되었습니다.',
        tag: 'launch',
        articles: [
          {
            title: 'Xcode 17 b2, 주요 변경 사항은?',
            source: 'StackWave',
            url: 'https://dev.example.com/xcode17-beta2',
            publishedAt: '2025-06-10',
          },
        ],
      },
      {
        id: '36-5',
        dateLabel: '2025.06.14',
        title: '카카오・네이버와 파트너십 발표',
        summary:
          '애플은 국내 양대 포털과 협력해 시리와 Apple Intelligence가 한국어 검색/콘텐츠를 자연스럽게 활용하도록 파트너십을 체결했습니다.',
        tag: 'policy',
        articles: [
          {
            title: '애플, 국내 포털과 AI 데이터 협력',
            source: 'JTBC',
            url: 'https://biz.example.com/apple-korea-ai',
            publishedAt: '2025-06-14',
          },
        ],
      },
      {
        id: '36-6',
        dateLabel: '2025.06.20',
        title: '한국어 기반 애플 AI 모델 베타 공개',
        summary:
          '애플은 한국어에 최적화된 온디바이스 LLM을 공개하며 한국 사용자에게 우선 베타 테스트 기회를 제공했습니다.',
        tag: 'launch',
        articles: [
          {
            title: '애플, 한국 맞춤형 LLM 베타 공개',
            source: 'MTN',
            url: 'https://biz.example.com/apple-korean-llm',
            publishedAt: '2025-06-20',
          },
        ],
      },
      {
        id: '36-7',
        dateLabel: '2025.06.24',
        title: 'AI 프라이버시 화이트페이퍼 발표',
        summary:
          'Apple Intelligence의 온디바이스 처리 방식과 Private Cloud Compute 아키텍처를 설명한 기술 백서가 배포되어 규제 당국/개발자들의 우려를 해소했습니다.',
        tag: 'policy',
        articles: [
          {
            title: 'Private Cloud Compute 심층 분석',
            source: 'SecureStack',
            url: 'https://security.example.com/private-cloud-compute',
            publishedAt: '2025-06-24',
          },
        ],
      },
      {
        id: '36-8',
        dateLabel: '2025.07.01',
        title: '첫 번째 서드파티 데모 앱 공개',
        summary:
          '국내 뉴스 요약 앱이 Apple Intelligence Summaries API를 접목한 사례를 공개하며, 타임라인 생성/콘텐츠 큐레이션 기능을 시연했습니다.',
        tag: 'launch',
        articles: [
          {
            title: '한국 개발사, Apple Intelligence 활용 사례 발표',
            source: 'Chrono News',
            url: 'https://news.example.com/apple-intel-korea-case',
            publishedAt: '2025-07-01',
          },
        ],
      },
    ],
  },
  '19': {
    keywordId: '19',
    keywordLabel: '아이폰 17',
    intro:
      '아이폰 17 시리즈와 관련된 공급망 루머, 주요 발표, 출시 일정을 정리했습니다.',
    events: [
      {
        id: '19-1',
        dateLabel: '2025.04.18',
        title: '프로 모델에 테라포닉 코어 탑재 루머',
        summary:
          '서플라이 체인 보고서에 따르면 A19 프로 칩에는 신규 테라포닉 코어가 포함되어 온디바이스 AI 성능이 40% 향상될 것으로 알려졌습니다.',
        tag: 'rumor',
        articles: [
          {
            title: '아이폰 17 프로, 테라포닉 코어 탑재?',
            source: '9to5mac',
            url: 'https://rumor.example.com/iphone17-teraphonic',
            publishedAt: '2025-04-18',
          },
        ],
      },
      {
        id: '19-2',
        dateLabel: '2025.05.12',
        title: '디스플레이 공급망 점검',
        summary:
          'LG디스플레이와 BOE가 연속 양산 심사를 통과하며 프로맥스 모델용 LTPO 패널 공급이 확정 단계에 들어섰습니다.',
        tag: 'supply',
        articles: [
          {
            title: 'LTPO 패널, 아이폰17 체인에서 본 생산 현황',
            source: 'ETNews',
            url: 'https://display.example.com/iphone17-ltpo',
            publishedAt: '2025-05-12',
          },
        ],
      },
      {
        id: '19-3',
        dateLabel: '2025.09.10',
        title: '정식 출시 및 판매 시작',
        summary:
          '아이폰 17 시리즈가 1차 출시국에서 판매를 시작하며, 한국은 2주 후 순차 출시 일정이 공지되었습니다.',
        tag: 'launch',
        articles: [
          {
            title: '아이폰 17 출시 첫 날 리포트',
            source: 'Bloombyte',
            url: 'https://mobile.example.com/iphone17-launch-day',
            publishedAt: '2025-09-10',
          },
        ],
      },
    ],
  },
};

const FALLBACK_EVENTS: TimelineEvent[] = [
  {
    id: 'fallback-1',
    dateLabel: '업데이트 예정',
    title: '타임라인 데이터를 준비 중입니다',
    summary:
      '해당 키워드의 주요 사건을 수집하는 대로 이곳에 순차적으로 업데이트됩니다.',
    articles: [],
  },
];

const defaultIntro =
  '해당 키워드에 대한 타임라인 데이터를 준비 중입니다. 최신 이슈가 모이는 대로 순차적으로 업데이트됩니다.';

const decodeLabel = (value: string) => {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.trim() || value;
  } catch {
    return value;
  }
};

export const buildTimelineForKeyword = (
  keywordId: string,
  keywordLabel?: string
): KeywordTimeline => {
  if (TIMELINES[keywordId]) {
    return TIMELINES[keywordId];
  }

  const safeLabel = keywordLabel?.trim() || decodeLabel(keywordId);
  return {
    keywordId,
    keywordLabel: safeLabel,
    intro: defaultIntro,
    events: FALLBACK_EVENTS,
  };
};

export type TimelineSummary = {
  keywordId: string;
  keywordLabel: string;
  intro: string;
  latestEvent: TimelineEvent | null;
  totalEvents: number;
};

export const listCuratedTimelines = (): TimelineSummary[] => {
  return Object.values(TIMELINES).map((timeline) => {
    const latestEvent =
      timeline.events.length > 0
        ? timeline.events[timeline.events.length - 1]
        : null;
    return {
      keywordId: timeline.keywordId,
      keywordLabel: timeline.keywordLabel,
      intro: timeline.intro,
      latestEvent,
      totalEvents: timeline.events.length,
    };
  });
};
