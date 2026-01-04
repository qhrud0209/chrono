import { buildApiBaseCandidates, buildEndpointUrl } from '@/lib/apiBase';
import { getServiceSupabaseClient } from '@/lib/newsVectors';

export type TimelineArticle = {
  title: string,
  source?: string | null,
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

type KeywordRow = {
  id: number,
  keyword: string,
  description?: string | null,
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || 'keyword';

const parseId = (value: string): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeKeywordInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const decoded = decodeURIComponent(trimmed);
    return decoded.trim() || null;
  } catch {
    return trimmed;
  }
};

const fetchKeywordById = async (id: number): Promise<KeywordRow | null> => {
  const { data, error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .select('id, keyword, description')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch keyword ${id}: ${error.message}`);
  }

  return ((data || []) as KeywordRow[])[0] ?? null;
};

const fetchKeywordByName = async (
  keyword: string,
): Promise<KeywordRow | null> => {
  const client = getServiceSupabaseClient();
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select('id, keyword, description')
    .eq('keyword', trimmed)
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to fetch keyword "${trimmed}": ${error.message}`,
    );
  }

  if (data && data.length > 0) {
    return (data as KeywordRow[])[0] ?? null;
  }

  const { data: ilikeData, error: ilikeError } = await client
    .from(KEYWORD_TABLE)
    .select('id, keyword, description')
    .ilike('keyword', trimmed)
    .limit(1);

  if (ilikeError) {
    throw new Error(
      `Failed to fetch keyword "${trimmed}": ${ilikeError.message}`,
    );
  }

  return ((ilikeData || []) as KeywordRow[])[0] ?? null;
};

const resolveTimelineMeta = async (
  keywordId: string,
): Promise<TimelineMeta> => {
  const fallbackLabel = decodeLabel(keywordId);
  try {
    const numericId = parseId(keywordId);
    const row =
      numericId !== null
        ? await fetchKeywordById(numericId)
        : await fetchKeywordByName(
            normalizeKeywordInput(keywordId) ?? keywordId,
          );

    if (row) {
      return {
        keywordLabel: row.keyword?.trim() || fallbackLabel,
        intro: row.description?.trim() || '',
      };
    }
  } catch (error) {
    console.error('Failed to resolve timeline meta', error);
  }

  return {
    keywordLabel: fallbackLabel,
    intro: '',
  };
};

const buildFallbackTimeline = (
  keywordId: string,
  meta: TimelineMeta,
): KeywordTimeline => ({
  keywordId,
  keywordLabel: meta.keywordLabel,
  intro: meta.intro,
  events: [],
});

export const buildTimelineForKeyword = async (
  keywordId: string,
): Promise<KeywordTimeline> => {
  const meta = await resolveTimelineMeta(keywordId);
  const remoteTimeline = await buildTimelineFromServer(keywordId, meta);
  if (remoteTimeline) {
    return remoteTimeline;
  }
  return buildFallbackTimeline(keywordId, meta);
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
  meta: TimelineMeta,
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
  const source = (item.media ?? '').trim() || null;

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
