import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseClient } from "../lib/newsVectors";

type KeywordRow = {
  id: number;
  keyword: string;
  embedding?: number[] | string | null;
  name_embedding?: number[] | string | null;
};

const parseApply = () => {
  if (process.argv.includes("--dry-run")) return false;
  const envValue = process.env.KEYWORD_PRUNE_NO_EMBED_APPLY?.trim();
  if (envValue === "0") return false;
  if (envValue === "1") return true;
  if (process.argv.includes("--apply")) return true;
  return true;
};

const PRUNE_CONFIG = {
  apply: parseApply(),
  batch: clamp(
    process.env.KEYWORD_PRUNE_NO_EMBED_BATCH
      ? Number(process.env.KEYWORD_PRUNE_NO_EMBED_BATCH)
      : 200,
    1,
    2000,
  ),
  concurrency: clamp(
    process.env.KEYWORD_PRUNE_NO_EMBED_CONCURRENCY
      ? Number(process.env.KEYWORD_PRUNE_NO_EMBED_CONCURRENCY)
      : 30,
    1,
    64,
  ),
  maxRows: process.env.KEYWORD_PRUNE_NO_EMBED_MAX
    ? Number(process.env.KEYWORD_PRUNE_NO_EMBED_MAX)
    : null,
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";

const log = (...args: unknown[]) => console.log("[prune:no-embed]", ...args);

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

const hasEmbedding = (value: unknown) => {
  const embedding = coerceEmbedding(value);
  return Array.isArray(embedding) && embedding.length > 0;
};

async function fetchBatch(
  client: SupabaseClient,
  afterId: number | null,
  limit: number,
) {
  let query = client
    .from(KEYWORD_TABLE)
    .select("id, keyword, embedding, name_embedding")
    .order("id", { ascending: true })
    .limit(limit);

  if (afterId !== null) {
    query = query.gt("id", afterId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch keywords: ${error.message}`);
  return (data || []) as KeywordRow[];
}

async function deleteKeyword(client: SupabaseClient, id: number) {
  const { error } = await client.from(KEYWORD_TABLE).delete().eq("id", id);
  if (error) throw new Error(`Failed to delete keyword ${id}: ${error.message}`);
}

async function main() {
  requireEnv(
    "SUPABASE_URL",
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );

  log(
    `Pruning keywords without embeddings (apply=${
      PRUNE_CONFIG.apply ? "yes" : "no"
    }, batch=${PRUNE_CONFIG.batch}, concurrency=${PRUNE_CONFIG.concurrency}${
      PRUNE_CONFIG.maxRows ? `, max_rows=${PRUNE_CONFIG.maxRows}` : ""
    })`,
  );

  const client = getServiceSupabaseClient();
  let lastId: number | null = null;
  let processed = 0;
  let candidates = 0;
  let deleted = 0;

  while (true) {
    if (PRUNE_CONFIG.maxRows && processed >= PRUNE_CONFIG.maxRows) break;
    const batch = await fetchBatch(client, lastId, PRUNE_CONFIG.batch);
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1].id;

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(PRUNE_CONFIG.concurrency, batch.length) },
      async () => {
        while (true) {
          if (PRUNE_CONFIG.maxRows && processed >= PRUNE_CONFIG.maxRows) break;
          const idx = cursor++;
          if (idx >= batch.length) break;
          const row = batch[idx];
          processed++;

          const hasTextEmbedding = hasEmbedding(row.embedding);
          const hasNameEmbedding = hasEmbedding(row.name_embedding);
          if (hasTextEmbedding || hasNameEmbedding) continue;

          candidates++;
          if (!PRUNE_CONFIG.apply) {
            log(`mark delete #${row.id} "${row.keyword}" (missing embeddings)`);
            continue;
          }

          try {
            await deleteKeyword(client, row.id);
            deleted++;
            log(`deleted #${row.id} "${row.keyword}" (missing embeddings)`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log(`delete failed for #${row.id} (${row.keyword}): ${message}`);
          }
        }
      },
    );

    await Promise.all(workers);
  }

  log(
    `Done. Processed=${processed}, candidates=${candidates}, deleted=${deleted}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
