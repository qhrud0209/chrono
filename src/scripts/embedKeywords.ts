import "dotenv/config";
import { embedText, getServiceSupabaseClient } from "../lib/newsVectors";

type KeywordRow = {
  id: number;
  keyword: string;
  description?: string | null;
  embedding?: number[] | null;
  name_embedding?: number[] | null;
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";
const BATCH_SIZE = clamp(
  process.env.KEYWORD_EMBED_BATCH ? Number(process.env.KEYWORD_EMBED_BATCH) : 100,
  1,
  1000,
);
const CONCURRENCY = clamp(
  process.env.KEYWORD_EMBED_CONCURRENCY ? Number(process.env.KEYWORD_EMBED_CONCURRENCY) : 30,
  1,
  64,
);
const MAX_ROWS = process.env.KEYWORD_EMBED_MAX ? Number(process.env.KEYWORD_EMBED_MAX) : null;

const log = (...args: unknown[]) => console.log("[keyword:embed]", ...args);

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const requireEnv = (name: string, value: string | undefined | null) => {
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
};

const coerceEmbedding = (value: unknown): number[] | null => {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
};

const buildText = (keyword: string, description?: string | null) => {
  const parts = [keyword, description].filter(Boolean).map((v) => v?.toString().trim());
  const combined = parts.filter(Boolean).join("\n\n");
  return combined || keyword;
};

async function fetchBatch(offset: number, limit: number) {
  const client = getServiceSupabaseClient();
  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select("id, keyword, description, embedding, name_embedding")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch keywords: ${error.message}`);
  }
  return (data || []) as KeywordRow[];
}

async function updateEmbeddings(row: KeywordRow, payload: Partial<KeywordRow>) {
  const client = getServiceSupabaseClient();
  const { error } = await client
    .from(KEYWORD_TABLE)
    .update(payload)
    .eq("id", row.id);
  if (error) {
    throw new Error(`Failed to update keyword ${row.id}: ${error.message}`);
  }
}

async function processRow(row: KeywordRow): Promise<boolean> {
  const hasTextEmbed = Boolean(coerceEmbedding(row.embedding));
  const hasNameEmbed = Boolean(coerceEmbedding(row.name_embedding));

  if (hasTextEmbed && hasNameEmbed) {
    return false; // nothing to do
  }

  const payload: Partial<KeywordRow> = {};

  if (!hasTextEmbed) {
    const text = buildText(row.keyword, row.description);
    if (!text.trim()) {
      log(`skip #${row.id}: empty keyword/description`);
    } else {
      payload.embedding = await embedText(text);
    }
  }

  if (!hasNameEmbed) {
    const nameText = row.keyword?.trim();
    if (!nameText) {
      log(`skip #${row.id}: empty keyword name`);
    } else {
      payload.name_embedding = await embedText(nameText);
    }
  }

  const needsUpdate = payload.embedding || payload.name_embedding;
  if (needsUpdate) {
    await updateEmbeddings(row, payload);
    return true;
  }

  return false;
}

async function main() {
  requireEnv("SUPABASE_URL", process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

  log(
    `Embedding keywords in table "${KEYWORD_TABLE}" (batch=${BATCH_SIZE}, concurrency=${CONCURRENCY}${
      MAX_ROWS ? `, max_rows=${MAX_ROWS}` : ""
    })`,
  );

  let offset = 0;
  let processed = 0;
  let updated = 0;

  while (true) {
    if (MAX_ROWS && processed >= MAX_ROWS) break;
    const batch = await fetchBatch(offset, BATCH_SIZE);
    if (batch.length === 0) break;

    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
      while (true) {
        if (MAX_ROWS && processed >= MAX_ROWS) break;
        const idx = cursor++;
        if (idx >= batch.length) break;
        const row = batch[idx];
        processed++;

        try {
          const didUpdate = await processRow(row);
          if (didUpdate) {
            updated++;
            if (updated % 50 === 0) {
              log(`updated ${updated} rows...`);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log(`failed #${row.id} (${row.keyword}): ${message}`);
        }
      }
    });

    await Promise.all(workers);
    offset += BATCH_SIZE;
  }

  log(`Done. Processed=${processed}, updated=${updated}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
