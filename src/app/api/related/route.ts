import { NextResponse } from 'next/server';

import {
  cosineSimilarity,
  embedText,
  getServiceSupabaseClient,
} from '@/lib/newsVectors';
import { normalize } from '@/lib/similarity';

type KeywordRow = {
  id: number;
  keyword: string;
  embedding?: number[] | null;
  name_embedding?: number[] | null;
};

type RelatedItem = {
  id: number;
  keyword: string;
  score: number;
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || 'keyword';
const MATCH_FUNCTION =
  process.env.SUPABASE_MATCH_KEYWORDS_FUNCTION?.trim() ||
  process.env.SUPABASE_MATCH_KEYWORD_FUNCTION?.trim() ||
  'match_keyword_embeddings';
const USE_NAME_EMBEDDING =
  (process.env.KEYWORD_RELATED_USE_NAME ?? '0').trim() !== '0';
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;
const MAX_FALLBACK_ROWS = Number.isFinite(
  Number(process.env.KEYWORD_RELATED_MAX_ROWS),
)
  ? Math.max(10, Number(process.env.KEYWORD_RELATED_MAX_ROWS))
  : 4000;

export const runtime = 'nodejs'; // ensure Node APIs available

const clampLimit = (value?: string | null) => {
  if (value == null || value.trim() === '') return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
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

const searchViaRpc = async (
  embedding: number[],
  limit: number,
  base: string,
): Promise<RelatedItem[] | null> => {
  if (!MATCH_FUNCTION) return null;

  const { data, error } = await getServiceSupabaseClient().rpc(
    MATCH_FUNCTION,
    {
      query_embedding: embedding,
      match_count: Math.min(limit + 5, MAX_LIMIT + 5),
      use_name: USE_NAME_EMBEDDING,
    },
  );

  if (error) {
    console.warn(`keyword match RPC failed: ${error.message}`);
    return null;
  }

  const rows = Array.isArray(data) ? data : [];
  const scored = rows
    .map((row) => {
      const id =
        (row as any).keyword_id ??
        (row as any).id ??
        (row as any).news_id ??
        null;
      const term =
        (row as any).keyword ??
        (row as any).keyword_name ??
        (row as any).name ??
        null;
      const score = parseSimilarity(row as any);
      if (!term || typeof score !== 'number' || id == null) return null;
      return { id: Number(id), keyword: term as string, score };
    })
    .filter((item): item is RelatedItem => Boolean(item))
    .filter(
      (item) =>
        Number.isFinite(item.id) &&
        normalize(item.keyword) !== base &&
        item.score > 0,
    );

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};

const searchLocally = async (
  embedding: number[],
  limit: number,
  base: string,
): Promise<RelatedItem[]> => {
  const selectColumns = USE_NAME_EMBEDDING
    ? 'id, keyword, name_embedding, embedding'
    : 'id, keyword, embedding';

  const { data, error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .select(selectColumns)
    .limit(MAX_FALLBACK_ROWS);

  if (error) {
    throw new Error(`Failed to load keyword embeddings: ${error.message}`);
  }

  const rows = Array.isArray(data)
    ? (data as unknown as KeywordRow[])
    : [];

  const scored = rows
    .map((row) => {
      const candidate = USE_NAME_EMBEDDING
        ? coerceEmbedding(row.name_embedding) ?? coerceEmbedding(row.embedding)
        : coerceEmbedding(row.embedding);
      if (!candidate || candidate.length === 0) return null;
      const score = cosineSimilarity(embedding, candidate);
      if (!Number.isFinite(score)) return null;
      return { id: row.id, keyword: row.keyword, score };
    })
    .filter((item): item is RelatedItem => Boolean(item))
    .filter((item) => normalize(item.keyword) !== base && item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
  const limit = clampLimit(searchParams.get('k') || searchParams.get('limit'));

  if (!q) return NextResponse.json({ related: [] });

  try {
    const queryEmbedding = await embedText(q);
    const base = normalize(q);

    let related = await searchViaRpc(queryEmbedding, limit, base);
    if (!related) {
      related = await searchLocally(queryEmbedding, limit, base);
    }

    return NextResponse.json({
      related: related.map((item) => ({
        id: item.id,
        keyword: item.keyword,
      })),
    });
  } catch (error) {
    console.error('Failed to load related keywords', error);
    return NextResponse.json({ related: [] }, { status: 200 });
  }
}
