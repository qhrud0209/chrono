import { createClient, SupabaseClient } from "@supabase/supabase-js";

const OPENAI_EMBEDDING_ENDPOINT = "https://api.openai.com/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
const DEFAULT_EMBED_TIMEOUT_MS = 20_000;

const stripEnv = (value?: string | null) =>
  value ? value.replace(/['"]/g, "").trim() : null;

export const NEWS_TABLE = stripEnv(process.env.NEWS_TABLE) || "news";
export const EMBEDDING_TABLE =
  stripEnv(process.env.NEWS_EMBEDDING_TABLE) || NEWS_TABLE;
export const EMBEDDING_COLUMN =
  stripEnv(process.env.NEWS_EMBEDDING_COLUMN) || "embedding";
export const EMBEDDING_ID_COLUMN =
  EMBEDDING_TABLE === NEWS_TABLE ? "id" : "news_id";
export const isInlineEmbeddingTable = EMBEDDING_TABLE === NEWS_TABLE;

let cachedClient: SupabaseClient | null = null;

export const getServiceSupabaseClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;

  const url =
    stripEnv(process.env.SUPABASE_URL) ||
    stripEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key =
    stripEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    stripEnv(process.env.SUPABASE_SECRET_KEY) ||
    stripEnv(process.env.SUPABASE_KEY);

  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  }

  cachedClient = createClient(url, key);
  return cachedClient;
};

type EmbedOptions = {
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
  signal?: AbortSignal;
};

export const embedText = async (input: string, opts?: EmbedOptions): Promise<number[]> => {
  const text = input.trim();
  if (!text) throw new Error("Cannot embed empty text.");

  const apiKey = stripEnv(opts?.apiKey || process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const model = opts?.model || DEFAULT_EMBEDDING_MODEL;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_EMBED_TIMEOUT_MS;

  const controller = !opts?.signal ? new AbortController() : null;
  const signal = opts?.signal || controller?.signal;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(OPENAI_EMBEDDING_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: text }),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings error (${res.status}): ${body || res.statusText}`);
    }

    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const embedding = json.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("OpenAI embeddings response missing embedding.");
    }

    return embedding;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return 0;
  }
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const buildNewsEmbeddingText = (
  title?: string | null,
  content?: string | null,
  maxChars = 7000,
): string => {
  const parts = [title, content]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part) && part.length > 0);

  if (parts.length === 0) return "";

  const combined = parts.join("\n\n");
  if (combined.length <= maxChars) return combined;
  return `${combined.slice(0, maxChars - 3)}...`;
};

export type NewsEmbeddingRow = {
  id?: number; // when embedding is stored inline on news table
  news_id?: number; // when using separate embedding table
  title: string | null;
  content: string | null;
  url?: string | null;
  URL?: string | null;
  embedding?: number[] | null;
};
