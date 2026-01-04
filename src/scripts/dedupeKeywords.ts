import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cosineSimilarity, embedText, getServiceSupabaseClient } from "../lib/newsVectors";

type LlmDecision =
  | { action: "merge"; keyword?: string; description?: string }
  | { action: "rename"; keyword: string; description?: string }
  | { action: "skip" };

type KeywordRow = {
  id: number;
  keyword: string;
  embedding?: number[] | null;
  name_embedding?: number[] | null;
  description?: string | null;
};

// Tune dedupe behavior here (instead of env overrides)
const DEDUPE_CONFIG = {
  threshold: 0.7,
  minThreshold: 0.05,
  maxThreshold: 0.999,
  maxGroupSize: 0, // 0 = no upper cap
  maxCandidates: 4000,
  apply: true, // set true to force merge without env flags
  deleteSecondaries: true, // set true to force deletion without env flags
  useNameEmbeddingOnly: false, // 후보 탐색 시 이름 임베딩만 사용
  maxNeighborsPerKeyword: 30, // 후보 상한 (각 키워드별 상위 N만 유지)
  mergeConcurrency: 60, // 그룹 병합 병렬도 (LLM 호출 포함)
  embedConcurrency: clamp(
    process.env.KEYWORD_DEDUPE_EMBED_CONCURRENCY
      ? Number(process.env.KEYWORD_DEDUPE_EMBED_CONCURRENCY)
      : 30,
    1,
    64,
  ),
  aggressiveDelete: true, // true면 LLM 없이 이름 유사 그룹을 최소 id만 남기고 삭제
  llmModel:
    process.env.KEYWORD_DEDUPE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini",
  llmMaxTokens: 320,
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || "keyword";
const APPLY =
  typeof DEDUPE_CONFIG.apply === "boolean"
    ? DEDUPE_CONFIG.apply
    : process.env.KEYWORD_DEDUPE_APPLY === "1" || process.argv.includes("--apply");
const DELETE_SECONDARIES =
  typeof DEDUPE_CONFIG.deleteSecondaries === "boolean"
    ? DEDUPE_CONFIG.deleteSecondaries
    : process.env.KEYWORD_DEDUPE_DELETE === "1" || process.argv.includes("--delete");
const THRESHOLD = clamp(
  DEDUPE_CONFIG.threshold,
  DEDUPE_CONFIG.minThreshold,
  DEDUPE_CONFIG.maxThreshold,
);
const MAX_GROUP_SIZE =
  DEDUPE_CONFIG.maxGroupSize <= 0
    ? 0
    : clamp(DEDUPE_CONFIG.maxGroupSize, 2, 200);
const MAX_CANDIDATES = clamp(DEDUPE_CONFIG.maxCandidates, 10, 20000);
const EMBED_CONCURRENCY = clamp(DEDUPE_CONFIG.embedConcurrency, 1, 64);
const SHOULD_EMBED_TEXT = !DEDUPE_CONFIG.useNameEmbeddingOnly;

const log = (...args: unknown[]) => {
  console.log("[dedupe]", ...args);
};

const buildPrompt = (primary: KeywordRow, secondary: KeywordRow) => {
  const format = (row: KeywordRow) =>
    [
      `keyword: ${row.keyword || "(없음)"}`,
      `description: ${(row.description || "").trim() || "(없음)"}`,
    ].join("\n");

  const instructions = [
    "You are merging duplicate keywords in a news/knowledge graph.",
    "Compare the two keywords and decide one of: merge, rename, skip.",
    "- merge: PREFERRED when they are close variants or overlap; choose a single, clear keyword (can be new) and optionally a concise merged description.",
    '- rename: use ONLY if they must stay separate; give the SECONDARY a NEW, more specific name (must differ from both original names, e.g., "트럼프" -> "트럼프 탄핵 위기"). Provide the new name and optional description for the secondary.',
    "- skip: only if clearly unrelated.",
    "Always return strict JSON with keys: action, keyword (optional for merge, required for rename), description (optional).",
  ].join(" ");

  const user = [
    "Primary (keep):",
    format(primary),
    "",
    "Secondary (candidate to merge/rename):",
    format(secondary),
  ].join("\n");

  return { instructions, user };
};

async function decideWithLlm(primary: KeywordRow, secondary: KeywordRow): Promise<LlmDecision> {
  const apiKey = requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  const { instructions, user } = buildPrompt(primary, secondary);

  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEDUPE_CONFIG.llmModel,
      max_tokens: DEDUPE_CONFIG.llmMaxTokens,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${body || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI returned empty content");
  }

  try {
    const parsed = JSON.parse(content) as LlmDecision;
    if (
      parsed &&
      (parsed.action === "merge" || parsed.action === "rename" || parsed.action === "skip")
    ) {
      return parsed;
    }
  } catch {
    // fallthrough
  }
  throw new Error(`Unexpected LLM response: ${content.slice(0, 200)}`);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

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

async function fetchKeywords(client: SupabaseClient): Promise<KeywordRow[]> {
  log(`Fetching keywords from table "${KEYWORD_TABLE}" (limit=${MAX_CANDIDATES})...`);
  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select("id, keyword, embedding, name_embedding, description")
    .order("id", { ascending: true })
    .limit(MAX_CANDIDATES);

  if (error) {
    throw new Error(`Failed to load keywords: ${error.message}`);
  }
  const rows = (data || []) as KeywordRow[];
  log(`Loaded ${rows.length} keywords.`);
  return rows;
}

async function ensureEmbeddings(
  client: SupabaseClient,
  row: KeywordRow,
): Promise<{ text: number[] | null; name: number[] }> {
  let textEmbedding = coerceEmbedding(row.embedding) || null;
  let nameEmbedding = coerceEmbedding(row.name_embedding) || null;
  const payload: Partial<KeywordRow> = {};

  if (SHOULD_EMBED_TEXT && (!textEmbedding || textEmbedding.length === 0)) {
    const text = buildEmbedTextForKeyword(row.keyword, row.description);
    if (!text.trim()) {
      throw new Error(`keyword_id=${row.id} has no text to embed`);
    }
    textEmbedding = await embedTextFn(text);
    payload.embedding = textEmbedding;
  }

  if (!nameEmbedding || nameEmbedding.length === 0) {
    const nameText = row.keyword?.trim();
    if (!nameText) {
      throw new Error(`keyword_id=${row.id} has empty keyword to embed`);
    }
    nameEmbedding = await embedTextFn(nameText);
    payload.name_embedding = nameEmbedding;
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await client
      .from(KEYWORD_TABLE)
      .update(payload)
      .eq("id", row.id);
    if (error) throw new Error(`Failed to save embeddings for keyword_id=${row.id}: ${error.message}`);
  }

  if (!nameEmbedding || nameEmbedding.length === 0) {
    throw new Error(`keyword_id=${row.id} has missing name embedding`);
  }

  return { text: textEmbedding, name: nameEmbedding };
}

type Pair = { a: KeywordRow; b: KeywordRow; score: number };

type PairBuildResult = { pairs: Pair[]; topSamples: Pair[] };

async function buildPairs(client: SupabaseClient, rows: KeywordRow[]): Promise<PairBuildResult> {
  // Preload embeddings
  const textEmbeddings: Record<number, number[] | null> = {};
  const nameEmbeddings: Record<number, number[]> = {};
  log(`Preloading embeddings for ${rows.length} keywords...`);
  if (!SHOULD_EMBED_TEXT) {
    log("  Name embedding only: text embeddings will not be generated.");
  }
  const withoutTextEmbedding = SHOULD_EMBED_TEXT
    ? rows.filter((row) => !coerceEmbedding(row.embedding))
    : [];
  const withoutNameEmbedding = rows.filter((row) => !coerceEmbedding(row.name_embedding));
  if (withoutTextEmbedding.length > 0 || withoutNameEmbedding.length > 0) {
    log(
      `  missing embeddings → text:${withoutTextEmbedding.length} name:${withoutNameEmbedding.length} (generating via OpenAI)`,
    );
  } else {
    log("  All rows already have embeddings; skipping regeneration.");
  }

  let cursor = 0;
  let embeddedCount = 0;
  const embedWorkers = Array.from(
    { length: Math.min(EMBED_CONCURRENCY, rows.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= rows.length) break;
        const row = rows[idx];
        const { text, name } = await ensureEmbeddings(client, row);
        textEmbeddings[row.id] = text;
        nameEmbeddings[row.id] = name;
        embeddedCount++;
        if (embeddedCount % 50 === 0 || embeddedCount === rows.length) {
          log(`  embedded ${embeddedCount}/${rows.length}`);
        }
      }
    },
  );

  await Promise.all(embedWorkers);

  const pairs: Pair[] = [];
  const topSamples: Pair[] = [];
  log(`Computing pairwise similarity (threshold=${THRESHOLD})...`);
  const allCandidates: Pair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const score = (() => {
        const nameA = nameEmbeddings[a.id];
        const nameB = nameEmbeddings[b.id];
        if (DEDUPE_CONFIG.useNameEmbeddingOnly) {
          if (!nameA || !nameB) return 0;
          return cosineSimilarity(nameA, nameB);
        }
        const scores = [];
        const textA = textEmbeddings[a.id];
        const textB = textEmbeddings[b.id];
        if (textA && textB) scores.push(cosineSimilarity(textA, textB));
        if (nameA && nameB) scores.push(cosineSimilarity(nameA, nameB));
        return scores.length ? Math.max(...scores) : 0;
      })();
      if (Number.isFinite(score) && score >= THRESHOLD) {
        const candidate: Pair = { a, b, score };
        pairs.push(candidate);
        allCandidates.push(candidate);
      }

       // keep a few highest pairs for diagnostics even if under threshold
       const candidate: Pair = { a, b, score };
       topSamples.push(candidate);
       topSamples.sort((x, y) => y.score - x.score);
       if (topSamples.length > 12) {
         topSamples.length = 12;
       }
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  // Limit neighbors per keyword to keep candidate volume manageable
  if (DEDUPE_CONFIG.maxNeighborsPerKeyword > 0) {
    const limit = DEDUPE_CONFIG.maxNeighborsPerKeyword;
    const counts = new Map<number, number>();
    const filtered: Pair[] = [];
    allCandidates
      .sort((a, b) => b.score - a.score)
      .forEach((p) => {
        const cA = counts.get(p.a.id) ?? 0;
        const cB = counts.get(p.b.id) ?? 0;
        if (cA >= limit || cB >= limit) return;
        filtered.push(p);
        counts.set(p.a.id, cA + 1);
        counts.set(p.b.id, cB + 1);
      });
    log(
      `Candidate pairs trimmed to ${filtered.length} (per-keyword maxNeighbors=${limit}, before=${pairs.length})`,
    );
    filtered.sort((a, b) => b.score - a.score);
    return { pairs: filtered, topSamples };
  }

  return { pairs, topSamples };
}

function groupPairs(pairs: Pair[]): KeywordRow[][] {
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

  const groups: Record<number, KeywordRow[]> = {};
  for (const pair of pairs) {
    const root = find(pair.a.id);
    groups[root] = groups[root] || [];
    if (!groups[root].some((k) => k.id === pair.a.id)) groups[root].push(pair.a);
    if (!groups[root].some((k) => k.id === pair.b.id)) groups[root].push(pair.b);
  }

  const result = Object.values(groups).map((g) => g.sort((x, y) => x.id - y.id));
  if (MAX_GROUP_SIZE > 0) {
    return result.filter((g) => g.length >= 2 && g.length <= MAX_GROUP_SIZE);
  }
  return result.filter((g) => g.length >= 2);
}

const buildEmbedTextForKeyword = (keyword: string, description?: string | null) => {
  const parts = [keyword, description].filter(Boolean).map((v) => v?.toString().trim());
  const combined = parts.filter(Boolean).join("\n\n");
  return combined || keyword;
};

const embedTextFn = embedText;

const updateKeyword = async (
  client: SupabaseClient,
  row: KeywordRow,
  keyword: string,
  description?: string | null,
) => {
  const text = buildEmbedTextForKeyword(keyword, description);
  const embedding = await embedTextFn(text);
  const nameEmbedding = await embedTextFn(keyword);
  const { error } = await client
    .from(KEYWORD_TABLE)
    .update({ keyword, description: description ?? null, embedding, name_embedding: nameEmbedding })
    .eq("id", row.id);
  if (error) {
    throw new Error(`Failed to update keyword ${row.id}: ${error.message}`);
  }
};

async function applyMerge(client: SupabaseClient, group: KeywordRow[]) {
  let primary = group[0]; // smallest id
  let primaryKeyword = primary.keyword;
  let primaryDescription = primary.description ?? null;

  if (DEDUPE_CONFIG.aggressiveDelete && DELETE_SECONDARIES) {
    const primaryId = primary.id;
    const victims = group.slice(1);
    if (victims.length > 0) {
      const ids = victims.map((v) => v.id);
      const { error } = await client.from(KEYWORD_TABLE).delete().in("id", ids);
      if (error) {
        throw new Error(`Failed aggressive delete for group head #${primaryId}: ${error.message}`);
      }
      log(
        `aggressive-delete: kept #${primaryId} (${primary.keyword}), removed [${ids.join(
          ", ",
        )}] (size=${group.length})`,
      );
    }
    return;
  }

  for (const secondary of group.slice(1)) {
    let decision: LlmDecision;
    try {
      decision = await decideWithLlm(primary, secondary);
    } catch (err) {
      log(
        `LLM decision failed for #${primary.id} vs #${secondary.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }

    if (decision.action === "skip") {
      log(`skip: #${primary.id}(${primary.keyword}) ↔ #${secondary.id}(${secondary.keyword})`);
      continue;
    }

    if (decision.action === "rename") {
      const newKeyword = decision.keyword?.trim() || "";
      const current = secondary.keyword?.trim() || "";
      if (!newKeyword) {
        log(`rename skipped (empty keyword) for #${secondary.id}`);
        continue;
      }
      if (newKeyword === current || newKeyword === primaryKeyword) {
        log(
          `rename skipped (no change) for #${secondary.id} "${secondary.keyword}" -> "${newKeyword}"`,
        );
        continue;
      }
      const newDesc = decision.description?.trim() || secondary.description || null;
      await updateKeyword(client, secondary, newKeyword, newDesc);
      log(
        `rename: #${secondary.id} "${secondary.keyword}" -> "${newKeyword}" (kept as separate node)`,
      );
      continue;
    }

    // merge
    const mergedKeyword = decision.keyword?.trim() || primaryKeyword;
    const mergedDesc =
      decision.description?.trim() ||
      [primaryDescription, secondary.description]
        .filter((v) => v && v.trim())
        .join("\n")
        .trim() ||
      null;

    await updateKeyword(client, primary, mergedKeyword, mergedDesc);

    if (DELETE_SECONDARIES) {
      const { error } = await client.from(KEYWORD_TABLE).delete().eq("id", secondary.id);
      if (error) {
        throw new Error(
          `Failed to delete duplicate #${secondary.id} (${secondary.keyword}): ${error.message}`,
        );
      }
      log(
        `merge+delete: kept #${primary.id} as "${mergedKeyword}", removed #${secondary.id} (${secondary.keyword})`,
      );
    } else {
      log(
        `merge (secondary kept): updated #${primary.id} to "${mergedKeyword}" using #${secondary.id} (${secondary.keyword})`,
      );
    }

    // refresh primary snapshot for next iterations
    primaryKeyword = mergedKeyword;
    primaryDescription = mergedDesc;
    primary = { ...primary, keyword: mergedKeyword, description: mergedDesc };
  }
}

async function main() {
  log(
    `Scanning up to ${MAX_CANDIDATES} keywords for similarity >= ${THRESHOLD} (apply=${APPLY ? "yes" : "no"}, delete=${DELETE_SECONDARIES ? "yes" : "no"})`,
  );

  // fail fast with clearer messaging
  const supabaseUrl = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  log(`Using SUPABASE_URL=${supabaseUrl}`);
  void supabaseKey; // only used for validation above
  const client = getServiceSupabaseClient();
  const rows = await fetchKeywords(client);
  if (rows.length === 0) {
    log("No keywords found.");
    return;
  }

  const { pairs, topSamples } = await buildPairs(client, rows);
  if (pairs.length === 0) {
    log("No similar pairs found.");
    if (topSamples.length > 0) {
      const topLine = topSamples
        .slice(0, 5)
        .map(
          (p) => `#${p.a.id}(${p.a.keyword}) ↔ #${p.b.id}(${p.b.keyword}) sim=${p.score.toFixed(3)}`,
        )
        .join(" | ");
      log(`Top similarities (below threshold ${THRESHOLD}): ${topLine}`);
    }
    return;
  }

  log(`Found ${pairs.length} candidate pairs.`);
  pairs.slice(0, 10).forEach((p, idx) => {
    log(
      `${idx + 1}. #${p.a.id}(${p.a.keyword}) ↔ #${p.b.id}(${p.b.keyword}) sim=${p.score.toFixed(3)}`,
    );
  });

  const groups = groupPairs(pairs);
  if (groups.length === 0) {
    log("No mergeable groups.");
    return;
  }

  log(
    `Merge groups (primary = smallest id, maxGroupSize=${
      MAX_GROUP_SIZE > 0 ? MAX_GROUP_SIZE : "none"
    }):`,
  );
  groups.forEach((g, idx) => {
    const ids = g.map((k) => `#${k.id}(${k.keyword})`).join(", ");
    log(`${idx + 1}. ${ids}`);
  });

  if (!APPLY) {
    log(
      "\nDry-run only. Set KEYWORD_DEDUPE_APPLY=1 or run with --apply to merge. Add KEYWORD_DEDUPE_DELETE=1 or --delete to delete secondaries (ensure FK handling).",
    );
    return;
  }

  // 병합 병렬 처리
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(DEDUPE_CONFIG.mergeConcurrency, groups.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        const group = groups[idx];
        if (!group) break;
        await applyMerge(client, group);
      }
    },
  );
  await Promise.all(workers);

  log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
