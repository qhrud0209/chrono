import "dotenv/config";
import { NEWS_TABLE, embedText, getServiceSupabaseClient } from "../lib/newsVectors";

type KeywordRow = {
  id: number;
  keyword: string;
  embedding?: number[] | null;
  description?: string | null;
};

type NewsRow = {
  id: number;
  title: string | null;
  content: string | null;
};

const MATCH_FUNCTION =
  process.env.SUPABASE_MATCH_NEWS_FUNCTION?.trim() || "match_news_embeddings";
const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";
const KEYWORD_DESC_MODEL =
  process.env.KEYWORD_DESC_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-4o-mini";
const TOP_K = clampPositive(
  process.env.KEYWORD_DESC_TOPK ? Number(process.env.KEYWORD_DESC_TOPK) : 5,
  1,
  10,
);
const MAX_NEWS_CHARS = clampPositive(
  process.env.KEYWORD_DESC_NEWS_CHARS ? Number(process.env.KEYWORD_DESC_NEWS_CHARS) : 800,
  200,
  4000,
);
const MAX_TOKENS = clampPositive(
  process.env.KEYWORD_DESC_MAX_TOKENS ? Number(process.env.KEYWORD_DESC_MAX_TOKENS) : 320,
  64,
  800,
);
const MAX_EMBED_TEXT = clampPositive(
  process.env.KEYWORD_EMBED_MAX_CHARS ? Number(process.env.KEYWORD_EMBED_MAX_CHARS) : 2000,
  200,
  6000,
);
// Tune worker count here (not via env to keep behavior predictable).
const CONCURRENCY = 120;

function clampPositive(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const client = getServiceSupabaseClient();

async function fetchKeywords(): Promise<KeywordRow[]> {
  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select("id, keyword, embedding, description")
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load keywords: ${error.message}`);
  }
  return (data || []) as KeywordRow[];
}

async function fetchTopNews(keyword: KeywordRow): Promise<NewsRow[]> {
  let embedding = keyword.embedding;
  if (!embedding || embedding.length === 0) {
    embedding = await embedText(keyword.keyword);
  }

  const { data, error } = await client.rpc(MATCH_FUNCTION, {
    query_embedding: embedding,
    match_count: TOP_K,
  });

  if (error) {
    console.warn(`[match rpc] ${error.message} → fallback to recent news`);
    const { data: news, error: newsError } = await client
      .from(NEWS_TABLE)
      .select("id, title, content")
      .order("id", { ascending: false })
      .limit(TOP_K);

    if (newsError) {
      throw new Error(`Failed to fetch news fallback: ${newsError.message}`);
    }
    return (news || []) as NewsRow[];
  }

  const mapped = (data || []).map((row: any) => ({
    id: row.news_id ?? row.id,
    title: row.title ?? null,
    content: row.content ?? null,
  }));
  return mapped as NewsRow[];
}

const truncate = (text: string | null | undefined, max: number): string => {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
};

const buildEmbedText = (keyword: string, description: string): string => {
  const combined = `${keyword}\n\n${description}`.trim();
  if (combined.length <= MAX_EMBED_TEXT) return combined;
  return `${combined.slice(0, MAX_EMBED_TEXT - 3)}...`;
};

function buildPrompt(keyword: string, news: NewsRow[]): string {
  const lines: string[] = [];
  lines.push(`키워드: ${keyword}`);
  lines.push(`관련 뉴스 ${news.length}개:`);
  news.forEach((n, idx) => {
    lines.push(
      [
        `${idx + 1}. ${n.title || "(제목 없음)"}`,
        truncate(n.content, MAX_NEWS_CHARS),
      ].join("\n"),
    );
  });
  lines.push(
    "\n위 내용을 요약하여 이 키워드를 설명하는 단락을 2~3문장(최대 280자)으로 한국어로 작성해 주세요. 맥락과 핵심 포인트만 담아주세요.",
  );
  return lines.join("\n");
}

async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: KEYWORD_DESC_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You summarize news context to explain the given keyword in concise Korean. Keep it factual, avoid repetition, and stay under 280 characters.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI error (${res.status}): ${body || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned empty content.");
  return content;
}

async function updateKeywordDescription(id: number, keyword: string, description: string) {
  const embedTextForKeyword = buildEmbedText(keyword, description);

  const newEmbedding = await embedText(embedTextForKeyword);

  const { error } = await client
    .from(KEYWORD_TABLE)
    .update({ description, embedding: newEmbedding })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update keyword ${id}: ${error.message}`);
  }
}

async function main() {
  console.log(
    `Generating keyword descriptions using top ${TOP_K} news (model=${KEYWORD_DESC_MODEL})`,
  );
  const keywords = await fetchKeywords();
  if (keywords.length === 0) {
    console.log("No keywords found.");
    return;
  }

  let processed = 0;
  let updated = 0;

  let cursor = 0;

  const worker = async () => {
    while (true) {
      const kw = keywords[cursor++];
      if (!kw) break;
      processed++;

      const hasDesc = Boolean(kw.description && kw.description.trim().length > 0);
      if (hasDesc && process.env.KEYWORD_DESC_REFRESH !== "1") {
        continue;
      }

      try {
        const news = await fetchTopNews(kw);
        if (news.length === 0) {
          console.warn(`Skip keyword_id=${kw.id}: no related news found.`);
          continue;
        }
        const prompt = buildPrompt(kw.keyword, news);
        const desc =
          hasDesc && process.env.KEYWORD_DESC_REFRESH !== "1"
            ? kw.description!
            : await callOpenAI(prompt);
        await updateKeywordDescription(kw.id, kw.keyword, desc);
        updated++;
        console.log(`Updated keyword_id=${kw.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed keyword_id=${kw.id}: ${message}`);
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, keywords.length) }, () =>
    worker(),
  );
  await Promise.all(workers);

  console.log(`Done. Processed=${processed}, updated=${updated}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
