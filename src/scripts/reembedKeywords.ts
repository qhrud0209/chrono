import "dotenv/config";
import { embedText, getServiceSupabaseClient } from "../lib/newsVectors";

type KeywordRow = {
  id: number;
  keyword: string;
  description?: string | null;
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";
const BATCH_SIZE = clamp(
  process.env.KEYWORD_REEMBED_BATCH ? Number(process.env.KEYWORD_REEMBED_BATCH) : 100,
  1,
  1000,
);
const CONCURRENCY = clamp(
  process.env.KEYWORD_REEMBED_CONCURRENCY ? Number(process.env.KEYWORD_REEMBED_CONCURRENCY) : 30,
  1,
  64,
);
const MAX_ROWS = process.env.KEYWORD_REEMBED_MAX ? Number(process.env.KEYWORD_REEMBED_MAX) : null;

const log = (...args: unknown[]) => console.log("[reembed]", ...args);

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

const buildText = (row: KeywordRow) => {
  const parts = [row.keyword, row.description]
    .map((v) => v?.toString().trim())
    .filter((v): v is string => Boolean(v));
  const combined = parts.join("\n\n");
  return combined || row.keyword || "";
};

async function fetchBatch(offset: number, limit: number) {
  const client = getServiceSupabaseClient();
  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select("id, keyword, description")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch keywords: ${error.message}`);
  }
  return (data || []) as KeywordRow[];
}

async function saveEmbedding(id: number, embedding: number[]) {
  const client = getServiceSupabaseClient();
  const { error } = await client.from(KEYWORD_TABLE).update({ embedding }).eq("id", id);
  if (error) {
    throw new Error(`Failed to update keyword ${id}: ${error.message}`);
  }
}

async function main() {
  requireEnv("SUPABASE_URL", process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

  log(
    `Re-embedding keywords in table "${KEYWORD_TABLE}" (batch=${BATCH_SIZE}${
      MAX_ROWS ? `, max_rows=${MAX_ROWS}` : ""
    }, concurrency=${CONCURRENCY})`,
  );

  let offset = 0;
  let processed = 0;
  let updated = 0;

  while (true) {
    if (MAX_ROWS && processed >= MAX_ROWS) break;
    const batch = await fetchBatch(offset, BATCH_SIZE);
    if (batch.length === 0) break;

    // process batch with a simple worker pool
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
      while (true) {
        if (MAX_ROWS && processed >= MAX_ROWS) break;
        const idx = cursor++;
        if (idx >= batch.length) break;
        const row = batch[idx];
        processed++;

        const text = buildText(row);
        if (!text.trim()) {
          log(`skip #${row.id}: empty keyword/description`);
          continue;
        }

        try {
          const embedding = await embedText(text);
          await saveEmbedding(row.id, embedding);
          updated++;
          if (updated % 50 === 0) {
            log(`updated ${updated} rows...`);
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
