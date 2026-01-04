import "dotenv/config";
import {
  EMBEDDING_COLUMN,
  EMBEDDING_ID_COLUMN,
  EMBEDDING_TABLE,
  NEWS_TABLE,
  buildNewsEmbeddingText,
  embedText,
  getServiceSupabaseClient,
  isInlineEmbeddingTable,
} from "../lib/newsVectors";

type NewsRow = {
  id: number;
  title: string | null;
  content: string | null;
};

const batchSizeFromEnv = Number(process.env.EMBED_BATCH_SIZE);
const BATCH_SIZE =
  Number.isFinite(batchSizeFromEnv) && batchSizeFromEnv > 0 ? batchSizeFromEnv : 50;
const FORCE_REFRESH = process.env.EMBED_FORCE === "1";

const isMissingEmbeddingColumn = (message: string | undefined) => {
  if (!message) return false;
  const msg = message.toLowerCase();
  return msg.includes(EMBEDDING_COLUMN.toLowerCase()) && msg.includes("column") && msg.includes("does not exist");
};

async function fetchExistingIds(client = getServiceSupabaseClient()): Promise<Set<number>> {
  if (FORCE_REFRESH) return new Set();

  const { data, error } = await client
    .from(EMBEDDING_TABLE)
    .select(EMBEDDING_ID_COLUMN)
    .not(EMBEDDING_COLUMN, "is", null);
  if (error) {
    if (isMissingEmbeddingColumn(error.message)) {
      throw new Error(
        `임베딩 컬럼이 없습니다 (${EMBEDDING_TABLE}.${EMBEDDING_COLUMN}). sql/news_embeddings.sql을 실행하세요.`,
      );
    }
    throw new Error(`Failed to read existing embeddings: ${error.message}`);
  }
  return new Set(
    (data || [])
      .map((row: Record<string, unknown>) => row[EMBEDDING_ID_COLUMN])
      .filter((v): v is number => typeof v === "number"),
  );
}

async function fetchNewsBatch(offset: number, limit: number): Promise<NewsRow[]> {
  const { data, error } = await getServiceSupabaseClient()
    .from(NEWS_TABLE)
    .select("id, title, content")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch news batch: ${error.message}`);
  }

  return (data || []) as NewsRow[];
}

async function saveEmbedding(row: NewsRow, embedding: number[]) {
  const client = getServiceSupabaseClient();

  if (isInlineEmbeddingTable) {
    // 기존 news 행만 업데이트 (NOT NULL 컬럼 충돌 방지)
    const { error, data } = await client
      .from(NEWS_TABLE)
      .update({ [EMBEDDING_COLUMN]: embedding } as any)
      .eq("id", row.id)
      .select("id");

    if (error) {
      if (isMissingEmbeddingColumn(error.message)) {
        throw new Error(
          `임베딩 컬럼이 없습니다 (${EMBEDDING_TABLE}.${EMBEDDING_COLUMN}). sql/news_embeddings.sql을 실행하세요.`,
        );
      }
      throw new Error(`Failed to update embedding for news_id=${row.id}: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new Error(`Failed to update embedding for news_id=${row.id}: row not found`);
    }
    return;
  }

  const payload = {
    news_id: row.id,
    title: row.title,
    content: row.content,
    embedding,
  };

  const { error } = await client
    .from(EMBEDDING_TABLE)
    .upsert(payload as any, { onConflict: "news_id" });

  if (error) {
    if (isMissingEmbeddingColumn(error.message)) {
      throw new Error(
        `임베딩 컬럼이 없습니다 (${EMBEDDING_TABLE}.${EMBEDDING_COLUMN}). sql/news_embeddings.sql을 실행하세요.`,
      );
    }
    throw new Error(`Failed to upsert embedding for news_id=${row.id}: ${error.message}`);
  }
}

async function main() {
  const supabase = getServiceSupabaseClient();
  console.log(
    `Embedding news from '${NEWS_TABLE}' into '${EMBEDDING_TABLE}' (batch=${BATCH_SIZE}${
      FORCE_REFRESH ? ", force refresh" : ""
    })`,
  );

  // simple ping to validate permissions early
  await supabase.from(NEWS_TABLE).select("id").limit(1);

  const existingIds = await fetchExistingIds(supabase);
  if (existingIds.size > 0) {
    console.log(`Skipping ${existingIds.size} rows that already have embeddings.`);
  }

  let offset = 0;
  let processed = 0;
  let embedded = 0;

  while (true) {
    const batch = await fetchNewsBatch(offset, BATCH_SIZE);
    if (batch.length === 0) break;

    for (const row of batch) {
      processed++;
      if (!FORCE_REFRESH && existingIds.has(row.id)) {
        continue;
      }

      const text = buildNewsEmbeddingText(row.title, row.content);
      if (!text) {
        console.warn(`Skip news_id=${row.id}: missing title/content.`);
        continue;
      }

      try {
        const embedding = await embedText(text);
        await saveEmbedding(row, embedding);
        embedded++;
        console.log(`Embedded news_id=${row.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed embedding news_id=${row.id}: ${message}`);
      }
    }

    offset += BATCH_SIZE;
  }

  console.log(`Done. Processed=${processed}, embedded=${embedded}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
