import { NextResponse } from "next/server";
import {
  NewsEmbeddingRow,
  cosineSimilarity,
  embedText,
  getServiceSupabaseClient,
  EMBEDDING_TABLE,
  EMBEDDING_COLUMN,
  EMBEDDING_ID_COLUMN,
  isInlineEmbeddingTable,
} from "@/lib/newsVectors";

type RpcRow = {
  news_id?: number;
  id?: number;
  title?: string | null;
  content?: string | null;
  url?: string | null;
  URL?: string | null;
  similarity?: number | null;
  score?: number | null;
  distance?: number | null;
};

type SearchResult = {
  newsId: number;
  title: string | null;
  content: string | null;
  url: string | null;
  similarity: number;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;
const DEFAULT_MATCH_FUNCTION =
  process.env.SUPABASE_MATCH_NEWS_FUNCTION?.trim() || "match_news_embeddings";
const MAX_FALLBACK_ROWS = Number.isFinite(Number(process.env.SEARCH_MAX_ROWS))
  ? Number(process.env.SEARCH_MAX_ROWS)
  : 4000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clampLimit = (value: string | null): number => {
  if (value == null || value.trim() === "") return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
};

const normalizeUrl = (row: { url?: string | null; URL?: string | null }): string | null => {
  const candidate = row.url ?? row.URL;
  if (!candidate) return null;
  try {
    return new URL(candidate).toString();
  } catch {
    return candidate;
  }
};

const parseSimilarity = (row: RpcRow): number | null => {
  if (typeof row.similarity === "number") return row.similarity;
  if (typeof row.score === "number") return row.score;
  if (typeof row.distance === "number") return 1 - row.distance;
  return null;
};

const isMissingTableError = (error: { message?: string; code?: string }) => {
  const msg = (error?.message || "").toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("does not exist") ||
    error.code === "PGRST202" // PostgREST table not found
  );
};

const isMissingEmbeddingColumn = (error: { message?: string }) => {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes(EMBEDDING_COLUMN.toLowerCase()) && msg.includes("column") && msg.includes("does not exist");
};

const searchViaRpc = async (
  embedding: number[],
  limit: number,
): Promise<SearchResult[] | null> => {
  if (!DEFAULT_MATCH_FUNCTION) return null;

  const { data, error } = await getServiceSupabaseClient().rpc(DEFAULT_MATCH_FUNCTION, {
    query_embedding: embedding,
    match_count: limit,
  });

  if (error) {
    console.warn(`match RPC failed: ${error.message}`);
    return null;
  }

  if (!Array.isArray(data)) return [];

  return data
    .map((row: RpcRow) => {
      const similarity = parseSimilarity(row);
      const newsId = row.news_id ?? row.id;
      if (!newsId || typeof similarity !== "number") return null;
      return {
        newsId,
        title: row.title ?? null,
        content: row.content ?? null,
        url: normalizeUrl(row),
        similarity,
      };
    })
    .filter((item): item is SearchResult => Boolean(item))
    .slice(0, limit);
};

const searchViaLocalSimilarity = async (
  embedding: number[],
  limit: number,
): Promise<SearchResult[]> => {
  const selectCols = isInlineEmbeddingTable
    ? `id, title, content, ${EMBEDDING_COLUMN}`
    : `news_id, title, content, url, URL, embedding`;

  const { data, error } = await getServiceSupabaseClient()
    .from(EMBEDDING_TABLE)
    .select(selectCols)
    .not(EMBEDDING_COLUMN, "is", null)
    .limit(MAX_FALLBACK_ROWS);

  if (error) {
    if (isMissingTableError(error)) {
      const missing = new Error(`Missing table: ${EMBEDDING_TABLE}`);
      (missing as any).code = "MISSING_TABLE";
      throw missing;
    }
    if (isMissingEmbeddingColumn(error)) {
      const missing = new Error(`Missing column: ${EMBEDDING_TABLE}.${EMBEDDING_COLUMN}`);
      (missing as any).code = "MISSING_COLUMN";
      throw missing;
    }
    throw new Error(`Failed to fetch embeddings: ${error.message}`);
  }

  const rows = (data || []) as NewsEmbeddingRow[];

  const scored = rows
    .map((row) => {
      const embeddingVec = isInlineEmbeddingTable
        ? (row as any)[EMBEDDING_COLUMN]
        : (row as any).embedding;
      if (!Array.isArray(embeddingVec)) return null;
      const similarity = cosineSimilarity(embedding, embeddingVec);
      if (!Number.isFinite(similarity)) return null;
      return {
        newsId: (row as any)[EMBEDDING_ID_COLUMN] ?? row.news_id ?? row.id,
        title: row.title,
        content: row.content,
        url: normalizeUrl(row),
        similarity,
      };
    })
    .filter((item): item is SearchResult => Boolean(item));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = (searchParams.get("q") || searchParams.get("query") || "").trim();
  const limit = clampLimit(searchParams.get("k") || searchParams.get("limit"));

  if (!keyword) {
    return NextResponse.json({ error: "q (query) is required" }, { status: 400 });
  }

  try {
    const queryEmbedding = await embedText(keyword);

    let results = await searchViaRpc(queryEmbedding, limit);
    if (!results || results.length === 0) {
      results = await searchViaLocalSimilarity(queryEmbedding, limit);
    }

    return NextResponse.json({ content: results || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (err instanceof Error && ((err as any).code === "MISSING_TABLE" || (err as any).code === "MISSING_COLUMN")) {
      return NextResponse.json(
        {
          error: message,
          hint: `news 임베딩 컬럼/함수가 없습니다. 'sql/news_embeddings.sql'을 Supabase SQL Editor나 psql로 실행해 주세요.`,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
