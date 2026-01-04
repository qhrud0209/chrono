import "dotenv/config";
import { getServiceSupabaseClient } from "../lib/newsVectors";

type KeywordRow = {
  id: number;
  keyword: string;
  description?: string | null;
  embedding?: number[] | string | null;
  name_embedding?: number[] | string | null;
};

const PRUNE_CONFIG = {
  apply: true, // true: delete rows, false: dry-run
  model:
    process.env.KEYWORD_PRUNE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini",
  maxTokens: 200,
  batch: clamp(
    process.env.KEYWORD_PRUNE_BATCH ? Number(process.env.KEYWORD_PRUNE_BATCH) : 100,
    1,
    1000,
  ),
  concurrency: clamp(
    process.env.KEYWORD_PRUNE_CONCURRENCY ? Number(process.env.KEYWORD_PRUNE_CONCURRENCY) : 30,
    1,
    32,
  ),
  maxRows: process.env.KEYWORD_PRUNE_MAX ? Number(process.env.KEYWORD_PRUNE_MAX) : null,
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const log = (...args: unknown[]) => console.log("[prune]", ...args);

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

const buildPrompt = (row: KeywordRow) => {
  const desc = (row.description || "").trim() || "(설명 없음)";
  const user = [
    `키워드: ${row.keyword}`,
    `설명: ${desc}`,
    "",
    "이 키워드를 위한 '타임라인(시간순 사건 기록)'을 만드는 것이 가치 있는지 판단해 주세요.",
    "아래 중 하나의 action을 JSON으로만 반환:",
    '- "keep": 타임라인 가치 있음',
    '- "delete": 너무 일반적/모호/잡음이라 타임라인 무가치',
    "조건:",
    "- 인물/조직/사건/제품/프로젝트/정책/캠페인 등 구체적이면 keep.",
    "- 단순 일반명사(예: 날씨, 뉴스, 정보), 중의적 한 단어, 의미 불명 문자열이면 delete.",
    "- 설명이 없더라도 키워드가 명확한 고유명사면 keep.",
    '응답 형식: {"action":"keep"|"delete","reason":"간단한 근거"}',
  ].join("\n");
  return user;
};

type Decision = { action: "keep" | "delete"; reason?: string };

async function decide(row: KeywordRow): Promise<Decision> {
  const apiKey = requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  const body = {
    model: PRUNE_CONFIG.model,
    max_tokens: PRUNE_CONFIG.maxTokens,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You classify keywords for timeline worthiness. Be strict about deleting generic/noise terms.",
      },
      { role: "user", content: buildPrompt(row) },
    ],
  };

  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
  }
  const json = (await res.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI returned empty content");
  }
  try {
    const parsed = JSON.parse(content) as Decision;
    if (parsed.action === "keep" || parsed.action === "delete") {
      return parsed;
    }
  } catch {
    // fallthrough
  }
  throw new Error(`Unexpected LLM response: ${content.slice(0, 200)}`);
}

async function fetchBatch(offset: number, limit: number) {
  log(`Fetching batch offset=${offset} limit=${limit}`);
  const client = getServiceSupabaseClient();
  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select("id, keyword, description, embedding, name_embedding")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Failed to fetch keywords: ${error.message}`);
  return (data || []) as KeywordRow[];
}

async function deleteKeyword(id: number) {
  const client = getServiceSupabaseClient();
  const { error } = await client.from(KEYWORD_TABLE).delete().eq("id", id);
  if (error) throw new Error(`Failed to delete keyword ${id}: ${error.message}`);
}

async function main() {
  requireEnv("SUPABASE_URL", process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

  log(
    `Pruning keywords in table "${KEYWORD_TABLE}" (apply=${PRUNE_CONFIG.apply ? "yes" : "no"}, batch=${PRUNE_CONFIG.batch}, concurrency=${PRUNE_CONFIG.concurrency}${
      PRUNE_CONFIG.maxRows ? `, max_rows=${PRUNE_CONFIG.maxRows}` : ""
    })`,
  );

  let offset = 0;
  let processed = 0;
  let deleted = 0;
  const deleteCandidates: Array<{ row: KeywordRow; reason: string }> = [];

  while (true) {
    if (PRUNE_CONFIG.maxRows && processed >= PRUNE_CONFIG.maxRows) break;
    const batch = await fetchBatch(offset, PRUNE_CONFIG.batch);
    if (batch.length === 0) break;

    log(`Processing batch size=${batch.length} (processed=${processed})`);

    let cursor = 0;
    const workers = Array.from({ length: Math.min(PRUNE_CONFIG.concurrency, batch.length) }, async () => {
      while (true) {
        if (PRUNE_CONFIG.maxRows && processed >= PRUNE_CONFIG.maxRows) break;
        const idx = cursor++;
        if (idx >= batch.length) break;
        const row = batch[idx];
        processed++;

        try {
          const hasTextEmbedding = Boolean(coerceEmbedding(row.embedding)?.length);
          const hasNameEmbedding = Boolean(coerceEmbedding(row.name_embedding)?.length);
          if (!hasTextEmbedding && !hasNameEmbedding) {
            deleteCandidates.push({ row, reason: "missing embeddings" });
            log(`mark delete #${row.id} "${row.keyword}" (missing embeddings)`);
            continue;
          }

          const decision = await decide(row);
          if (decision.action === "delete") {
            deleteCandidates.push({ row, reason: decision.reason || "" });
            log(`mark delete #${row.id} "${row.keyword}" (${decision.reason || "no reason"})`);
          } else {
            log(`keep #${row.id} "${row.keyword}"`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log(`decision failed for #${row.id} (${row.keyword}): ${message}`);
        }
      }
    });

    await Promise.all(workers);
    offset += PRUNE_CONFIG.batch;
  }

  if (deleteCandidates.length === 0) {
    log("No keywords marked for deletion.");
    return;
  }

  log(`Delete candidates: ${deleteCandidates.length}`);
  deleteCandidates.slice(0, 20).forEach((c, idx) => {
    log(
      `${idx + 1}. #${c.row.id} "${c.row.keyword}" -> delete (${c.reason || "no reason"})`,
    );
  });
  if (deleteCandidates.length > 20) {
    log(`...and ${deleteCandidates.length - 20} more`);
  }

  if (!PRUNE_CONFIG.apply) {
    log("Dry-run only (apply=false). No rows deleted.");
    return;
  }

  for (const { row } of deleteCandidates) {
    try {
      await deleteKeyword(row.id);
      deleted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`delete failed for #${row.id} (${row.keyword}): ${message}`);
    }
  }

  log(`Done. Processed=${processed}, marked=${deleteCandidates.length}, deleted=${deleted}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
