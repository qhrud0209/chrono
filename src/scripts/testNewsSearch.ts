import "dotenv/config";
import {
  NewsEmbeddingRow,
  EMBEDDING_TABLE,
  EMBEDDING_COLUMN,
  EMBEDDING_ID_COLUMN,
  isInlineEmbeddingTable,
  cosineSimilarity,
  embedText,
  getServiceSupabaseClient,
} from "../lib/newsVectors";

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

const MATCH_FUNCTION =
  process.env.SUPABASE_MATCH_NEWS_FUNCTION?.trim() || "match_news_embeddings";
const MAX_FALLBACK_ROWS = Number.isFinite(Number(process.env.SEARCH_MAX_ROWS))
  ? Number(process.env.SEARCH_MAX_ROWS)
  : 4000;

const clampLimit = (n?: number) => {
  if (!n || !Number.isFinite(n)) return 5;
  return Math.min(25, Math.max(1, Math.floor(n)));
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
    error.code === "PGRST202"
  );
};

const isMissingEmbeddingColumn = (error: { message?: string }) => {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes(EMBEDDING_COLUMN.toLowerCase()) && msg.includes("column") && msg.includes("does not exist");
};

async function searchViaRpc(embedding: number[], limit: number): Promise<SearchResult[] | null> {
  const { data, error } = await getServiceSupabaseClient().rpc(MATCH_FUNCTION, {
    query_embedding: embedding,
    match_count: limit,
  });

  if (error) {
    console.warn(`[match rpc] ${error.message}`);
    return null;
  }

  const rows = Array.isArray(data) ? (data as RpcRow[]) : [];

  return rows
    .map((row): SearchResult | null => {
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
    .filter((x): x is SearchResult => x !== null)
    .slice(0, limit);
}

async function searchViaFallback(embedding: number[], limit: number): Promise<SearchResult[]> {
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
      throw new Error(
        `[fallback select] ${EMBEDDING_TABLE} 테이블이 없습니다. sql/news_embeddings.sql을 실행해주세요.`,
      );
    }
    if (isMissingEmbeddingColumn(error)) {
      throw new Error(
        `[fallback select] ${EMBEDDING_TABLE}.${EMBEDDING_COLUMN} 컬럼이 없습니다. sql/news_embeddings.sql을 실행해주세요.`,
      );
    }
    throw new Error(`[fallback select] ${error.message}`);
  }

  const rows = Array.isArray(data)
    ? (data as unknown as NewsEmbeddingRow[])
    : [];
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
    .filter((x): x is SearchResult => Boolean(x));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}

async function main() {
  const [, , rawQuery, rawLimit] = process.argv;
  if (!rawQuery || !rawQuery.trim()) {
    console.error("사용법: npx tsx src/scripts/testNewsSearch.ts \"검색어\" [k]");
    process.exit(1);
  }

  const limit = clampLimit(rawLimit ? Number(rawLimit) : undefined);
  console.log(`검색어: "${rawQuery}" (k=${limit})`);

  const queryEmbedding = await embedText(rawQuery);

  let results = await searchViaRpc(queryEmbedding, limit);
  if (!results || results.length === 0) {
    console.log("RPC 결과 없음 → 로컬 코사인 유사도 fallback 실행");
    results = await searchViaFallback(queryEmbedding, limit);
  }

  if (!results || results.length === 0) {
    console.log("검색 결과가 없습니다.");
    return;
  }

  console.log("\n상위 결과:");
  for (const [idx, item] of results.entries()) {
    const display = [
      `${idx + 1}. #${item.newsId}`,
      item.title ? `제목: ${item.title}` : "제목 없음",
      item.url ? `URL: ${item.url}` : null,
      `유사도: ${item.similarity.toFixed(4)}`,
    ]
      .filter(Boolean)
      .join(" | ");
    console.log(display);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
