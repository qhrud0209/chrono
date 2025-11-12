import { buildApiBaseCandidates, buildEndpointUrl } from '@/lib/apiBase';

export type TimelineArticle = {
  title: string,
  source: string,
  url: string,
  publishedAt: string,
};

export type TimelineEvent = {
  id: string,
  dateLabel: string,
  title: string,
  summary: string,
  articles: TimelineArticle[],
  tag?: string,
};

export type KeywordTimeline = {
  keywordId: string,
  keywordLabel: string,
  intro: string,
  events: TimelineEvent[],
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

type TimelineMeta = {
  keywordLabel: string,
  intro: string,
};

const KNOWN_TIMELINE_META: Record<string, TimelineMeta> = {
  '36': {
    keywordLabel: 'WWDC25',
    intro:
      '애플이 WWDC 2025에서 공개한 주요 발표와 이후 파급 효과를 시간 순으로 정리했습니다.',
  },
};

const resolveTimelineMeta = (
  keywordId: string,
  keywordLabel?: string,
): TimelineMeta => {
  const fromMap = KNOWN_TIMELINE_META[keywordId];
  if (fromMap) {
    return fromMap;
  }

  const safeLabel = keywordLabel?.trim() || decodeLabel(keywordId);
  return {
    keywordLabel: safeLabel,
    intro: defaultIntro,
  };
};

const buildFallbackTimeline = (
  keywordId: string,
  keywordLabel?: string,
): KeywordTimeline => {
  const meta = resolveTimelineMeta(keywordId, keywordLabel);
  return {
    keywordId,
    keywordLabel: meta.keywordLabel,
    intro: meta.intro,
    events: FALLBACK_EVENTS,
  };
};

export const buildTimelineForKeyword = async (
  keywordId: string,
  keywordLabel?: string,
): Promise<KeywordTimeline> => {
  const remoteTimeline = await buildTimelineFromServer(
    keywordId,
    keywordLabel,
  );
  if (remoteTimeline) {
    return remoteTimeline;
  }
  return buildFallbackTimeline(keywordId, keywordLabel);
};

type ServerEventRecord = {
  eventId: number,
  eventDateTime?: string,
  eventTag?: string,
  eventName?: string,
  summary?: string,
};

type ServerEventsResponse = {
  content?: ServerEventRecord[],
};

type ServerNewsRecord = {
  newsId: number,
  media?: string,
  headline?: string,
  URL?: string,
};

type ServerNewsResponse = {
  content?: ServerNewsRecord[],
};

const buildTimelineFromServer = async (
  keywordId: string,
  keywordLabel?: string,
): Promise<KeywordTimeline | null> => {
  const bases = buildApiBaseCandidates();
  for (const base of bases) {
    const events = await fetchEventsFromBase(base, keywordId);
    if (events === null) {
      continue;
    }
    if (events.length === 0) {
      return null;
    }

    const meta = resolveTimelineMeta(keywordId, keywordLabel);
    const timelineEvents = await Promise.all(
      events.map(async event => {
        const news = await fetchNewsFromBase(base, event.eventId);
        return mapServerEventToTimeline(keywordId, event, news);
      }),
    );

    const filteredEvents = timelineEvents.filter(
      Boolean,
    ) as TimelineEvent[];

    if (filteredEvents.length === 0) {
      return null;
    }

    return {
      keywordId,
      keywordLabel: meta.keywordLabel,
      intro: meta.intro,
      events: filteredEvents,
    };
  }

  return null;
};

const fetchEventsFromBase = async (
  base: string,
  keywordId: string,
): Promise<ServerEventRecord[] | null> => {
  const path = `/api/events/${encodeURIComponent(keywordId)}`;
  const endpoint = buildEndpointUrl(base, path);
  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as ServerEventsResponse;
    if (!Array.isArray(payload.content)) {
      return [];
    }
    return payload.content;
  } catch (error) {
    console.error(`Failed to load events from ${endpoint}`, error);
    return null;
  }
};

const fetchNewsFromBase = async (
  base: string,
  eventId: number,
): Promise<ServerNewsRecord[]> => {
  const path = `/api/events/news/${eventId}`;
  const endpoint = buildEndpointUrl(base, path);
  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as ServerNewsResponse;
    if (!Array.isArray(payload.content)) {
      return [];
    }
    return payload.content;
  } catch (error) {
    console.error(`Failed to load news from ${endpoint}`, error);
    return [];
  }
};

const mapServerEventToTimeline = (
  keywordId: string,
  event: ServerEventRecord,
  newsItems: ServerNewsRecord[],
): TimelineEvent | null => {
  if (!event.eventId) {
    return null;
  }

  const summary = (event.summary ?? '').trim();
  const preferredTitle = (event.eventName ?? '').trim();
  const fallbackTitle =
    summary || '이벤트 내용이 제공되지 않았습니다';
  const title = preferredTitle || fallbackTitle;
  const dateLabel = formatEventDateLabel(event.eventDateTime);
  const articles = newsItems
    .map(mapServerNewsToArticle)
    .filter(Boolean) as TimelineArticle[];

  return {
    id: `${keywordId}-${event.eventId}`,
    dateLabel,
    title,
    summary: summary && summary !== title ? summary : '',
    articles,
    tag: event.eventTag?.trim() || undefined,
  };
};

const mapServerNewsToArticle = (
  item: ServerNewsRecord,
): TimelineArticle | null => {
  if (!item.URL) {
    return null;
  }

  const title = (item.headline ?? '').trim() || '제목 미정';
  const source = (item.media ?? '').trim() || '언론사 미기재';

  return {
    title,
    source,
    url: item.URL,
    publishedAt: '',
  };
};

const formatEventDateLabel = (rawDate?: string) => {
  if (!rawDate) {
    return '날짜 미기재';
  }

  const normalized = rawDate.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return rawDate;
  }

  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
};
