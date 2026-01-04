import { NextResponse } from 'next/server';

import { getServiceSupabaseClient } from '@/lib/newsVectors';

type Params = {
  params: Promise<{ eventId: string }>,
};

type EventNewsRow = {
  id: number;
  event_id: number;
  media?: string | null;
  headline?: string | null;
  URL?: string | null;
};

const EVENT_NEWS_TABLE = process.env.EVENT_NEWS_TABLE?.trim() || 'event_news';

const parseId = (value: string): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeUrl = (row: EventNewsRow): string | null => {
  const candidate = row.URL;
  if (!candidate) return null;
  try {
    return new URL(candidate).toString();
  } catch {
    return candidate;
  }
};

const fetchEventNews = async (eventId: number): Promise<EventNewsRow[]> => {
  const { data, error } = await getServiceSupabaseClient()
    .from(EVENT_NEWS_TABLE)
    .select('id, event_id, media, headline, URL')
    .eq('event_id', eventId)
    .order('id', { ascending: true });

  if (error) {
    throw new Error(
      `Failed to fetch news for event ${eventId}: ${error.message}`,
    );
  }

  return (data || []) as EventNewsRow[];
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (_req: Request, { params }: Params) => {
  const { eventId: rawEventId } = await params;
  const eventId = parseId(rawEventId);
  if (eventId === null) {
    return NextResponse.json({ content: [] });
  }

  try {
    const rows = await fetchEventNews(eventId);
    const mapped = rows.map((row) => ({
      newsId: row.id,
      media: row.media ?? null,
      headline: row.headline ?? null,
      URL: normalizeUrl(row),
    }));

    return NextResponse.json({ content: mapped });
  } catch (error) {
    console.error('Failed to load event news', error);
    return NextResponse.json({ content: [] }, { status: 500 });
  }
};
