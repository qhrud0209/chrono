import { NextResponse } from 'next/server';

import { RelatedKeyword } from '@/app/components/topicGraphData';
import {
  cosineSimilarity,
  embedText,
  getServiceSupabaseClient,
} from '@/lib/newsVectors';

type KeywordRow = {
  id: number;
  keyword: string;
  description?: string | null;
  embedding?: number[] | null;
  name_embedding?: number[] | null;
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || 'keyword';
const MATCH_FUNCTION =
  process.env.SUPABASE_MATCH_KEYWORDS_FUNCTION?.trim() ||
  process.env.SUPABASE_MATCH_KEYWORD_FUNCTION?.trim() ||
  'match_keyword_embeddings';
const USE_NAME_EMBEDDING =
  (process.env.KEYWORD_RELATED_USE_NAME ?? '0').trim() !== '0';
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;
const MAX_FALLBACK_ROWS = Number.isFinite(
  Number(process.env.KEYWORD_RELATED_MAX_ROWS),
)
  ? Math.max(10, Number(process.env.KEYWORD_RELATED_MAX_ROWS))
  : 4000;

const clampLimit = (value?: string | null) => {
  if (value == null || value.trim() === '') return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
};

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

const coerceEmbedding = (value: unknown): number[] | null => {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
};

const buildEmbedText = (row: KeywordRow): string => {
  const parts = [row.keyword, row.description]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return parts || row.keyword;
};

const parseSimilarity = (row: {
  similarity?: number | null;
  score?: number | null;
  distance?: number | null;
}) => {
  if (typeof row.similarity === 'number') return row.similarity;
  if (typeof row.score === 'number') return row.score;
  if (typeof row.distance === 'number') return 1 - row.distance;
  return null;
};

const fetchKeywordById = async (id: number): Promise<KeywordRow | null> => {
  const { data, error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .select('id, keyword, description, embedding, name_embedding')
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
    .select('id, keyword, description, embedding, name_embedding')
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
    .select('id, keyword, description, embedding, name_embedding')
    .ilike('keyword', trimmed)
    .limit(1);

  if (ilikeError) {
    throw new Error(
      `Failed to fetch keyword "${trimmed}": ${ilikeError.message}`,
    );
  }

  return ((ilikeData || []) as KeywordRow[])[0] ?? null;
};

const ensureQueryEmbedding = async (row: KeywordRow): Promise<number[]> => {
  const nameEmbedding = coerceEmbedding(row.name_embedding);
  const textEmbedding = coerceEmbedding(row.embedding);

  if (USE_NAME_EMBEDDING && nameEmbedding?.length) return nameEmbedding;
  if (textEmbedding?.length) return textEmbedding;

  const payload: Partial<KeywordRow> = {};
  let embedding: number[] | null = null;

  if (USE_NAME_EMBEDDING && row.keyword?.trim()) {
    embedding = await embedText(row.keyword);
    payload.name_embedding = embedding;
  }

  if (!embedding) {
    const text = buildEmbedText(row);
    if (!text.trim()) {
      throw new Error(`keyword_id=${row.id} has no text to embed`);
    }
    embedding = await embedText(text);
    payload.embedding = embedding;
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await getServiceSupabaseClient()
      .from(KEYWORD_TABLE)
      .update(payload)
      .eq('id', row.id);
    if (error) {
      throw new Error(
        `Failed to save embedding for keyword ${row.id}: ${error.message}`,
      );
    }
  }

  if (!embedding) {
    throw new Error(`Failed to build embedding for keyword ${row.id}`);
  }

  return embedding;
};

const searchViaRpc = async (
  embedding: number[],
  limit: number,
  excludeId: number,
): Promise<RelatedKeyword[] | null> => {
  if (!MATCH_FUNCTION) return null;

  const params: Record<string, unknown> = {
    query_embedding: embedding,
    match_count: limit + 1, // allow exclusion of the center
    use_name: USE_NAME_EMBEDDING,
    exclude_id: excludeId,
  };

  const { data, error } = await getServiceSupabaseClient().rpc(
    MATCH_FUNCTION,
    params,
  );

  if (error) {
    console.warn(`keyword match RPC failed: ${error.message}`);
    return null;
  }

  const rows = Array.isArray(data) ? data : [];
  const mapped = rows
    .map((row) => {
      const relatedness = parseSimilarity(row as any);
      const keywordId =
        (row as any).keyword_id ??
        (row as any).id ??
        (row as any).news_id ??
        null;
      const keywordName =
        (row as any).keyword ??
        (row as any).keyword_name ??
        (row as any).name ??
        null;

      if (
        typeof relatedness !== 'number' ||
        keywordId == null ||
        keywordId === excludeId
      ) {
        return null;
      }

      return {
        keywordId,
        keywordName,
        relatedness,
      };
    })
    .filter((x): x is RelatedKeyword => Boolean(x));

  mapped.sort((a, b) => (b.relatedness || 0) - (a.relatedness || 0));
  return mapped.slice(0, limit);
};

const searchLocally = async (
  embedding: number[],
  limit: number,
  excludeId: number,
): Promise<RelatedKeyword[]> => {
  const { data, error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .select('id, keyword, embedding, name_embedding')
    .limit(MAX_FALLBACK_ROWS);

  if (error) {
    throw new Error(`Failed to load keyword embeddings: ${error.message}`);
  }

  const rows = (data || []) as KeywordRow[];

  const scored = rows
    .map((row) => {
      if (row.id === excludeId) return null;
      const candidateEmbedding = coerceEmbedding(row.embedding);

      if (!candidateEmbedding || candidateEmbedding.length === 0) return null;

      return {
        keywordId: row.id,
        keywordName: row.keyword,
        relatedness: cosineSimilarity(embedding, candidateEmbedding),
      };
    })
    .filter((x): x is RelatedKeyword => Boolean(x));

  scored.sort((a, b) => (b.relatedness || 0) - (a.relatedness || 0));
  return scored.slice(0, limit);
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const keywordId = parseId(id);
  const keywordName =
    keywordId === null ? normalizeKeywordInput(id) : null;
  const { searchParams } = new URL(request.url);
  const limit = clampLimit(searchParams.get('k') || searchParams.get('limit'));

  if (keywordId === null && !keywordName) {
    return NextResponse.json({ content: [] }, { status: 400 });
  }

  try {
    const keyword =
      keywordId !== null
        ? await fetchKeywordById(keywordId)
        : await fetchKeywordByName(keywordName!);
    if (!keyword) {
      return NextResponse.json({ content: [] }, { status: 404 });
    }

    const queryEmbedding = await ensureQueryEmbedding(keyword);

    let related =
      (await searchViaRpc(queryEmbedding, limit, keyword.id)) ?? [];
    if (related.length === 0) {
      related = await searchLocally(queryEmbedding, limit, keyword.id);
    }

    return NextResponse.json({ content: related });
  } catch (error) {
    console.error('Failed to load related keywords', error);
    return NextResponse.json({ content: [] }, { status: 500 });
  }
}
