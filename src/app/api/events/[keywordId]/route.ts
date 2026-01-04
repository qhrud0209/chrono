import { NextResponse } from 'next/server';

import { getServiceSupabaseClient } from '@/lib/newsVectors';

type Params = {
  params: Promise<{ keywordId: string }>,
};

type EventRow = {
  id: number;
  keyword_id: number;
  name?: string | null;
  datetime?: string | null;
  summary?: string | null;
  tag?: string | null;
};

type KeywordRow = {
  id: number;
  keyword: string;
};

const EVENT_TABLE = process.env.EVENT_TABLE?.trim() || 'event';
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

const fetchKeywordIdByName = async (
  keyword: string,
): Promise<number | null> => {
  const client = getServiceSupabaseClient();
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select('id, keyword')
    .eq('keyword', trimmed)
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to fetch keyword "${trimmed}": ${error.message}`,
    );
  }

  if (data && data.length > 0) {
    return (data as KeywordRow[])[0]?.id ?? null;
  }

  const { data: ilikeData, error: ilikeError } = await client
    .from(KEYWORD_TABLE)
    .select('id, keyword')
    .ilike('keyword', trimmed)
    .limit(1);

  if (ilikeError) {
    throw new Error(
      `Failed to fetch keyword "${trimmed}": ${ilikeError.message}`,
    );
  }

  return (ilikeData as KeywordRow[] | null)?.[0]?.id ?? null;
};

const fetchEvents = async (keywordId: number): Promise<EventRow[]> => {
  const { data, error } = await getServiceSupabaseClient()
    .from(EVENT_TABLE)
    .select('id, keyword_id, name, datetime, summary, tag')
    .eq('keyword_id', keywordId)
    .order('datetime', { ascending: true });

  if (error) {
    throw new Error(
      `Failed to fetch events for keyword ${keywordId}: ${error.message}`,
    );
  }

  return (data || []) as EventRow[];
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (_req: Request, { params }: Params) => {
  const { keywordId: rawKeywordId } = await params;
  const keywordId = parseId(rawKeywordId);
  const keywordName =
    keywordId === null ? normalizeKeywordInput(rawKeywordId) : null;

  try {
    const resolvedKeywordId =
      keywordId ??
      (keywordName ? await fetchKeywordIdByName(keywordName) : null);

    if (resolvedKeywordId == null) {
      return NextResponse.json({ content: [] });
    }

    const events = await fetchEvents(resolvedKeywordId);
    const mapped = events.map((row) => ({
      eventId: row.id,
      eventDateTime: row.datetime ?? null,
      eventTag: row.tag ?? null,
      eventName: row.name ?? null,
      summary: row.summary ?? null,
    }));

    return NextResponse.json({ content: mapped });
  } catch (error) {
    console.error('Failed to load events', error);
    return NextResponse.json({ content: [] }, { status: 500 });
  }
};
