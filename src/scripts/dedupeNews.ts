import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMBEDDING_COLUMN,
  EMBEDDING_ID_COLUMN,
  EMBEDDING_TABLE,
  NEWS_TABLE,
  buildNewsEmbeddingText,
  cosineSimilarity,
  embedText,
  getServiceSupabaseClient,
  isInlineEmbeddingTable,
} from "../lib/newsVectors";

type NewsRow = {
  id: number;
  title: string | null;
  content: string | null;
  url?: string | null;
  URL?: string | null;
  embedding?: number[] | null;
};

type NewsEmbeddingRow = {
  id?: number;
  news_id?: number;
  embedding?: number[] | null;
};

const DEDUPE_CONFIG = {
  threshold: Number(process.env.NEWS_DEDUPE_THRESHOLD) || 0.90,
  minThreshold: 0.5,
  maxThreshold: 0.9999,
  maxCandidates: Number(process.env.NEWS_DEDUPE_MAX) || 5000,
  maxNeighborsPerNews: Number(process.env.NEWS_DEDUPE_MAX_NEIGHBORS) || 30,
  apply: process.env.NEWS_DEDUPE_APPLY === "1" || process.argv.includes("--apply"),
  deleteNews:
    process.env.NEWS_DEDUPE_DELETE_NEWS !== "0" || process.argv.includes("--delete-news"),
  deleteEmbeddings:
    process.env.NEWS_DEDUPE_DELETE_EMBEDDINGS !== "0" ||
    process.argv.includes("--delete-embeddings"),
  generateMissingEmbeddings:
    process.env.NEWS_DEDUPE_EMBED_MISSING === "1" || process.argv.includes("--embed-missing"),
};

const THRESHOLD = clamp(
  DEDUPE_CONFIG.threshold,
  DEDUPE_CONFIG.minThreshold,
  DEDUPE_CONFIG.maxThreshold,
);
const MAX_CANDIDATES = clamp(DEDUPE_CONFIG.maxCandidates, 10, 20000);

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const log = (...args: unknown[]) => {
  console.log("[news-dedupe]", ...args);
};

const requireEnv = (name: string, value: string | undefined | null) => {
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
};

const isMissingColumnError = (error: { message?: string } | null) => {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
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

const normalizeUrl = (row: { url?: string | null; URL?: string | null }) => {
  const candidate = row.url ?? row.URL;
  if (!candidate) return null;
  try {
    return new URL(candidate).toString();
  } catch {
    return candidate;
  }
};

const selectNewsRowsWithFallback = async (
  client: SupabaseClient,
  columnsList: string[],
  options?: { ids?: number[]; limit?: number },
) => {
  const ids = options?.ids;
  const limit = options?.limit ?? MAX_CANDIDATES;

  for (const columns of columnsList) {
    let query = client.from(NEWS_TABLE).select(columns);
    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    } else {
      query = query.order("id", { ascending: true }).limit(limit);
    }

    const { data, error } = await query;
    if (!error) {
      return data || [];
    }

    if (!isMissingColumnError(error)) {
      throw new Error(`Failed to load news rows: ${error.message}`);
    }
  }

  throw new Error("Failed to load news rows: no compatible column set found.");
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

async function fetchInlineNewsRows(client: SupabaseClient): Promise<NewsRow[]> {
  const columnsList = [
    `id, title, content, url, URL, ${EMBEDDING_COLUMN}`,
    `id, title, content, URL, ${EMBEDDING_COLUMN}`,
    `id, title, content, url, ${EMBEDDING_COLUMN}`,
    `id, title, content, ${EMBEDDING_COLUMN}`,
  ];

  const data = await selectNewsRowsWithFallback(client, columnsList, {
    limit: MAX_CANDIDATES,
  });

  return data.map((row: any) => ({
    id: row.id,
    title: row.title ?? null,
    content: row.content ?? null,
    url: row.url ?? null,
    URL: row.URL ?? null,
    embedding: coerceEmbedding(row[EMBEDDING_COLUMN]),
  })) as NewsRow[];
}

async function fetchSeparateEmbeddings(
  client: SupabaseClient,
): Promise<NewsEmbeddingRow[]> {
  const selectCols = `${EMBEDDING_ID_COLUMN}, ${EMBEDDING_COLUMN}`;
  const { data, error } = await client
    .from(EMBEDDING_TABLE)
    .select(selectCols)
    .order(EMBEDDING_ID_COLUMN, { ascending: true })
    .limit(MAX_CANDIDATES);

  if (error) {
    throw new Error(`Failed to load embeddings: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    news_id: row.news_id,
    embedding: coerceEmbedding(row[EMBEDDING_COLUMN]),
  }));
}

async function fetchNewsRows(
  client: SupabaseClient,
  ids: number[],
): Promise<NewsRow[]> {
  if (ids.length === 0) return [];
  const chunks = chunkArray(ids, 250);
  const rows: NewsRow[] = [];
  for (const chunk of chunks) {
    const data = await selectNewsRowsWithFallback(
      client,
      [
        "id, title, content, url, URL",
        "id, title, content, URL",
        "id, title, content, url",
        "id, title, content",
      ],
      { ids: chunk },
    );
    data.forEach((row: any) => {
      rows.push({
        id: row.id,
        title: row.title ?? null,
        content: row.content ?? null,
        url: row.url ?? null,
        URL: row.URL ?? null,
      });
    });
  }
  return rows;
}

async function ensureEmbedding(
  client: SupabaseClient,
  row: NewsRow,
): Promise<number[] | null> {
  const existing = coerceEmbedding(row.embedding);
  if (existing && existing.length > 0) return existing;
  if (!DEDUPE_CONFIG.generateMissingEmbeddings) return null;

  const text = buildNewsEmbeddingText(row.title, row.content);
  if (!text.trim()) return null;
  const embedding = await embedText(text);

  if (isInlineEmbeddingTable) {
    const { error } = await client
      .from(NEWS_TABLE)
      .update({ [EMBEDDING_COLUMN]: embedding })
      .eq("id", row.id);
    if (error) {
      throw new Error(`Failed to save embedding for news ${row.id}: ${error.message}`);
    }
  } else {
    const { error } = await client
      .from(EMBEDDING_TABLE)
      .update({ [EMBEDDING_COLUMN]: embedding })
      .eq(EMBEDDING_ID_COLUMN, row.id);
    if (error) {
      throw new Error(`Failed to save embedding for news ${row.id}: ${error.message}`);
    }
  }

  return embedding;
}

type Pair = { a: NewsRow; b: NewsRow; score: number };

async function buildPairs(client: SupabaseClient, rows: NewsRow[]): Promise<Pair[]> {
  log(`Preloading embeddings for ${rows.length} news...`);
  const embeddingMap = new Map<number, number[]>();
  let missing = 0;

  for (const [idx, row] of rows.entries()) {
    const embedding = await ensureEmbedding(client, row);
    if (embedding && embedding.length > 0) {
      embeddingMap.set(row.id, embedding);
    } else {
      missing += 1;
    }
    if ((idx + 1) % 100 === 0 || idx + 1 === rows.length) {
      log(`  embedded ${idx + 1}/${rows.length}`);
    }
  }

  if (missing > 0) {
    log(`  skipped ${missing} rows without embeddings.`);
  }

  const pairs: Pair[] = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    const embA = embeddingMap.get(a.id);
    if (!embA) continue;
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j];
      const embB = embeddingMap.get(b.id);
      if (!embB) continue;
      const score = cosineSimilarity(embA, embB);
      if (Number.isFinite(score) && score >= THRESHOLD) {
        pairs.push({ a, b, score });
      }
    }
  }

  pairs.sort((x, y) => y.score - x.score);

  if (DEDUPE_CONFIG.maxNeighborsPerNews > 0) {
    const limit = DEDUPE_CONFIG.maxNeighborsPerNews;
    const counts = new Map<number, number>();
    const filtered: Pair[] = [];
    pairs.forEach((p) => {
      const cA = counts.get(p.a.id) ?? 0;
      const cB = counts.get(p.b.id) ?? 0;
      if (cA >= limit || cB >= limit) return;
      filtered.push(p);
      counts.set(p.a.id, cA + 1);
      counts.set(p.b.id, cB + 1);
    });
    return filtered;
  }

  return pairs;
}

function groupPairs(pairs: Pair[]): NewsRow[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    const p = parent.get(x);
    if (p === undefined || p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pb, pa);
  };

  for (const pair of pairs) {
    union(pair.a.id, pair.b.id);
  }

  const groups: Record<number, NewsRow[]> = {};
  for (const pair of pairs) {
    const root = find(pair.a.id);
    groups[root] = groups[root] || [];
    if (!groups[root].some((n) => n.id === pair.a.id)) groups[root].push(pair.a);
    if (!groups[root].some((n) => n.id === pair.b.id)) groups[root].push(pair.b);
  }

  return Object.values(groups)
    .map((g) => g.sort((a, b) => a.id - b.id))
    .filter((g) => g.length >= 2);
}

async function deleteNewsRows(client: SupabaseClient, ids: number[]) {
  if (ids.length === 0) return;
  const { error } = await client.from(NEWS_TABLE).delete().in("id", ids);
  if (error) {
    throw new Error(`Failed to delete news rows: ${error.message}`);
  }
}

async function deleteEmbeddingRows(client: SupabaseClient, ids: number[]) {
  if (ids.length === 0) return;
  const { error } = await client
    .from(EMBEDDING_TABLE)
    .delete()
    .in(EMBEDDING_ID_COLUMN, ids);
  if (error) {
    throw new Error(`Failed to delete embedding rows: ${error.message}`);
  }
}

async function loadNewsRows(client: SupabaseClient): Promise<NewsRow[]> {
  if (isInlineEmbeddingTable) {
    return fetchInlineNewsRows(client);
  }

  const embeddings = await fetchSeparateEmbeddings(client);
  const ids = embeddings
    .map((row) => row.news_id ?? row.id)
    .filter((id): id is number => typeof id === "number");
  const newsRows = await fetchNewsRows(client, ids);
  const newsMap = new Map<number, NewsRow>();
  newsRows.forEach((row) => newsMap.set(row.id, row));

  return embeddings
    .map((row): NewsRow | null => {
      const id = row.news_id ?? row.id;
      if (typeof id !== "number") return null;
      const news = newsMap.get(id);
      if (!news) return null;
      return {
        ...news,
        embedding: row.embedding ?? null,
      };
    })
    .filter((row): row is NewsRow => row !== null);
}

async function main() {
  log(
    `Scanning up to ${MAX_CANDIDATES} news for similarity >= ${THRESHOLD} (apply=${
      DEDUPE_CONFIG.apply ? "yes" : "no"
    })`,
  );

  const supabaseUrl = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  log(`Using SUPABASE_URL=${supabaseUrl}`);
  void supabaseKey;

  const client = getServiceSupabaseClient();
  const rows = await loadNewsRows(client);
  if (rows.length === 0) {
    log("No news rows found.");
    return;
  }

  const pairs = await buildPairs(client, rows);
  if (pairs.length === 0) {
    log("No similar pairs found.");
    return;
  }

  log(`Found ${pairs.length} candidate pairs.`);
  pairs.slice(0, 10).forEach((p, idx) => {
    const labelA = p.a.title?.trim() || p.a.id;
    const labelB = p.b.title?.trim() || p.b.id;
    log(`${idx + 1}. #${p.a.id}(${labelA}) ↔ #${p.b.id}(${labelB}) sim=${p.score.toFixed(4)}`);
  });

  const groups = groupPairs(pairs);
  if (groups.length === 0) {
    log("No mergeable groups.");
    return;
  }

  log(`Merge groups (primary = smallest id):`);
  groups.forEach((g, idx) => {
    const ids = g.map((n) => `#${n.id}`).join(", ");
    log(`${idx + 1}. ${ids}`);
  });

  if (!DEDUPE_CONFIG.apply) {
    log(
      "\nDry-run only. Set NEWS_DEDUPE_APPLY=1 or run with --apply to delete duplicates.",
    );
    return;
  }

  for (const group of groups) {
    const primary = group[0];
    const victims = group.slice(1);
    const ids = victims.map((n) => n.id);
    if (ids.length === 0) continue;

    if (DEDUPE_CONFIG.deleteEmbeddings && !isInlineEmbeddingTable) {
      await deleteEmbeddingRows(client, ids);
    }
    if (DEDUPE_CONFIG.deleteNews) {
      await deleteNewsRows(client, ids);
    }

    log(`deleted [${ids.join(", ")}], kept #${primary.id}`);
  }

  log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
