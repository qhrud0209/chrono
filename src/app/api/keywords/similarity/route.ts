import { NextResponse } from "next/server";
import { cosineSimilarity, embedText, getServiceSupabaseClient } from "@/lib/newsVectors";

type KeywordRow = {
  id: number;
  keyword: string;
  description?: string | null;
  embedding?: number[] | null;
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";

const buildEmbedText = (row: KeywordRow): string => {
  const parts = [row.keyword, row.description].filter(Boolean).join("\n\n").trim();
  return parts.length > 0 ? parts : row.keyword;
};

const fetchKeyword = async (id: number): Promise<KeywordRow | null> => {
  const { data, error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .select("id, keyword, description, embedding")
    .eq("id", id)
    .limit(1);

  if (error) throw new Error(`Failed to fetch keyword ${id}: ${error.message}`);
  return (data || [])[0] as KeywordRow | undefined || null;
};

const ensureEmbedding = async (row: KeywordRow): Promise<number[]> => {
  if (Array.isArray(row.embedding) && row.embedding.length > 0) return row.embedding;
  const text = buildEmbedText(row);
  if (!text.trim()) throw new Error(`keyword_id=${row.id} has no text to embed`);

  const embedding = await embedText(text);
  const { error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .update({ embedding })
    .eq("id", row.id);
  if (error) throw new Error(`Failed to save embedding for keyword ${row.id}: ${error.message}`);
  return embedding;
};

const parseId = (value: string | null): number | null => {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id1 = parseId(searchParams.get("a") || searchParams.get("id1"));
  const id2 = parseId(searchParams.get("b") || searchParams.get("id2"));

  if (!id1 || !id2) {
    return NextResponse.json(
      { error: "Provide two keyword ids via a/id1 and b/id2 query params" },
      { status: 400 },
    );
  }

  try {
    const [rowA, rowB] = await Promise.all([fetchKeyword(id1), fetchKeyword(id2)]);
    if (!rowA || !rowB) {
      return NextResponse.json(
        { error: `Keyword not found: ${!rowA ? id1 : id2}` },
        { status: 404 },
      );
    }

    const [embA, embB] = await Promise.all([ensureEmbedding(rowA), ensureEmbedding(rowB)]);
    const similarity = cosineSimilarity(embA, embB);

    return NextResponse.json({
      similarity,
      a: { id: rowA.id, keyword: rowA.keyword },
      b: { id: rowB.id, keyword: rowB.keyword },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
