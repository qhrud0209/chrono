import "dotenv/config";
import { cosineSimilarity, embedText, getServiceSupabaseClient } from "../lib/newsVectors";

type KeywordRow = {
  id: number;
  keyword: string;
  description?: string | null;
  embedding?: number[] | null;
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";

async function fetchKeyword(id: number): Promise<KeywordRow | null> {
  const { data, error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .select("id, keyword, description, embedding")
    .eq("id", id)
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch keyword ${id}: ${error.message}`);
  }
  return (data || [])[0] as KeywordRow | undefined || null;
}

const buildEmbedText = (row: KeywordRow): string => {
  const parts = [row.keyword, row.description].filter(Boolean).join("\n\n").trim();
  if (parts.length > 0) return parts;
  return row.keyword;
};

async function ensureEmbedding(row: KeywordRow): Promise<number[]> {
  if (Array.isArray(row.embedding) && row.embedding.length > 0) return row.embedding;
  const text = buildEmbedText(row);
  if (!text.trim()) throw new Error(`keyword_id=${row.id} has no text to embed`);
  const embedding = await embedText(text);
  const { error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .update({ embedding })
    .eq("id", row.id);
  if (error) {
    throw new Error(`Failed to save embedding for keyword ${row.id}: ${error.message}`);
  }
  return embedding;
}

async function main() {
  const [, , aStr, bStr] = process.argv;
  const aId = Number(aStr);
  const bId = Number(bStr);

  if (!Number.isFinite(aId) || !Number.isFinite(bId)) {
    console.error("사용법: npm run keyword:sim -- <id1> <id2>");
    process.exit(1);
  }

  const [a, b] = await Promise.all([fetchKeyword(aId), fetchKeyword(bId)]);
  if (!a) {
    console.error(`keyword ${aId} not found`);
    process.exit(1);
  }
  if (!b) {
    console.error(`keyword ${bId} not found`);
    process.exit(1);
  }

  const [aEmbed, bEmbed] = await Promise.all([ensureEmbedding(a), ensureEmbedding(b)]);
  const sim = cosineSimilarity(aEmbed, bEmbed);

  console.log(`유사도: ${sim.toFixed(4)} (cosine)`);
  console.log(`#${a.id} "${a.keyword}" vs #${b.id} "${b.keyword}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
