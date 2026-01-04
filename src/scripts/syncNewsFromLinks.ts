import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { extractArticleFromUrl } from '../lib/articleCrawler';

type LinkRow = {
  id: number;
  URL?: string | null;
  url?: string | null;
  datetime?: string | null;
};
type NewsRow = { id: number };
type CrawlTask = { link: LinkRow; attempts: number };
type EmbedTask = {
  id: number;
  title: string;
  content: string;
  url?: string | null;
  datetime?: string | null;
  attempts: number;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Fail fast to avoid confusing missing env errors later.
  throw new Error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.',
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isMissingColumnError = (error: { message?: string } | null) => {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('column') && msg.includes('does not exist');
};

function extractStatusFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/\b(\d{3})\b/);
  return match ? Number(match[1]) : null;
}

async function fetchLinks(): Promise<LinkRow[]> {
  const candidates = [
    'id, URL, datetime',
    'id, url, datetime',
    'id, URL',
    'id, url',
  ];
  for (const columns of candidates) {
    const { data, error } = await supabase.from('link').select(columns);
    if (!error) {
      return Array.isArray(data)
        ? (data as unknown as LinkRow[])
        : [];
    }
    if (!isMissingColumnError(error)) {
      throw error;
    }
  }

  throw new Error('No compatible link columns found.');
}

async function fetchExistingNewsIds(): Promise<Set<number>> {
  const { data, error } = await supabase.from('news').select('id');
  if (error) throw error;
  return new Set((data || []).map((row: NewsRow) => row.id));
}

async function upsertNews(
  id: number,
  title: string,
  content: string,
  url?: string | null,
  datetime?: string | null,
) {
  const basePayloads = [
    { id, title, content, URL: url ?? null },
    { id, title, content, url: url ?? null },
    { id, title, content },
  ];

  const payloads =
    datetime !== undefined
      ? basePayloads.map((payload) => ({ ...payload, datetime }))
      : basePayloads;

  const tryUpsert = async (candidates: Record<string, unknown>[]) => {
    for (const payload of candidates) {
      const { error } = await supabase.from('news').upsert(payload, {
        onConflict: 'id',
      });
      if (!error) return true;
      if (!isMissingColumnError(error)) {
        throw error;
      }
    }
    return false;
  };

  const didUpsert = await tryUpsert(payloads);
  if (didUpsert) return;

  if (datetime !== undefined) {
    const fallbackUpsert = await tryUpsert(basePayloads);
    if (fallbackUpsert) return;
  }

  throw new Error('No compatible news columns found for upsert.');
}

async function updateNewsMetadata(
  id: number,
  url: string | null,
  datetime?: string | null,
) {
  if (!url && datetime === undefined) return;
  const hasDatetime = datetime !== undefined;

  const payloads: Record<string, unknown>[] = [];
  if (url) {
    payloads.push(hasDatetime ? { URL: url, datetime } : { URL: url });
    payloads.push(hasDatetime ? { url: url, datetime } : { url: url });
  } else if (hasDatetime) {
    payloads.push({ datetime });
  }

  for (const payload of payloads) {
    const { error } = await supabase.from('news').update(payload).eq('id', id);
    if (!error) return;
    if (!isMissingColumnError(error)) {
      throw error;
    }
  }

  if (url && hasDatetime) {
    const urlOnlyPayloads = [{ URL: url }, { url }];
    for (const payload of urlOnlyPayloads) {
      const { error } = await supabase.from('news').update(payload).eq('id', id);
      if (!error) return;
      if (!isMissingColumnError(error)) {
        throw error;
      }
    }
  }
}

async function deleteLink(id: number) {
  const { error } = await supabase.from('link').delete().eq('id', id);
  if (error) throw error;
}

async function upsertEmbedding(id: number, embedding: number[]) {
  const { error } = await supabase
    .from('news')
    .update({ embedding })
    .eq('id', id);
  if (error) throw error;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY for embeddings');
  }
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  // Trim excessively long text to avoid request failure
  const normalized = text.length > 8000 ? text.slice(0, 8000) : text;

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: normalized,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI embedding error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid embedding response');
  }
  return embedding as number[];
}

async function main() {
  const links = await fetchLinks();
  if (links.length === 0) {
    console.log('No links found in link table.');
    return;
  }

  const existingIds = await fetchExistingNewsIds();
  console.log(
    `Found ${links.length} links; ${existingIds.size} news rows already exist.`,
  );

  const targets = links.filter(link => {
    const url = (link.URL ?? link.url ?? '').trim();
    if (!url) {
      console.warn(`Skip id=${link.id}: empty URL`);
      return false;
    }
    if (existingIds.has(link.id)) {
      void updateNewsMetadata(link.id, url, link.datetime ?? undefined).catch((err) => {
        console.warn(`Failed to update metadata for news id=${link.id}:`, err);
      });
      console.log(`Skip id=${link.id}: news already exists (id match).`);
      return false;
    }
    return true;
  });

  const MAX_CRAWL_RETRIES = 2;
  const MAX_EMBED_RETRIES = 2;
  const CRAWL_CONCURRENCY = 75;
  const EMBED_CONCURRENCY = 75;

  const crawlQueue: CrawlTask[] = targets.map(link => ({ link, attempts: 0 }));
  const embedQueue: EmbedTask[] = [];
  let activeCrawlWorkers = 0;

  const crawlWorker = async () => {
    activeCrawlWorkers++;
    try {
      while (crawlQueue.length > 0) {
        const task = crawlQueue.shift();
        if (!task) break;
        const { link, attempts } = task;
        const url = (link.URL ?? link.url ?? '').trim();

        // 1초 간격
        await sleep(1000);

        try {
          console.log(`Processing id=${link.id} (attempt ${attempts + 1}): ${url}`);
          const result = await extractArticleFromUrl(url, {
            maxOutputTokens: 4000,
            openAiTimeoutMs: 90_000,
            maxInputChars: 60_000,
            contentCharLimit: 8_000,
            summaryOnly: true,
            summaryMinWords: 120,
            summaryMaxWords: 240,
          });
          const title = result.title || '(untitled)';
          const content = result.content;

          if (!content) {
            console.warn(`No content extracted for id=${link.id}, url=${url}`);
          } else {
            embedQueue.push({
              id: link.id,
              title,
              content,
              url,
              datetime: link.datetime ?? undefined,
              attempts: 0,
            });
          }
        } catch (err) {
          const status = extractStatusFromError(err);
          if (status === 404) {
            console.warn(`Deleting link id=${link.id} due to 404`);
            try {
              await deleteLink(link.id);
            } catch (delErr) {
              console.error(`Failed to delete link id=${link.id}:`, delErr);
            }
            continue;
          }

          if (attempts < MAX_CRAWL_RETRIES) {
            console.warn(
              `Retrying id=${link.id} (status ${status ?? 'n/a'}, attempt ${
                attempts + 2
              })`,
            );
            crawlQueue.push({ link, attempts: attempts + 1 });
          } else {
            console.error(`Failed id=${link.id} after ${attempts + 1} attempts:`, err);
          }
        }
      }
    } finally {
      activeCrawlWorkers--;
    }
  };

  const embedWorker = async () => {
    while (true) {
      const task = embedQueue.shift();
      if (!task) {
        if (activeCrawlWorkers > 0) {
          await sleep(500);
          continue;
        }
        break;
      }

      const { id, title, content, url, datetime, attempts } = task;
      try {
        await upsertNews(id, title, content, url, datetime);
        console.log(`Saved news id=${id} (${title.slice(0, 60)}...)`);

        const embedding = await generateEmbedding(content);
        await upsertEmbedding(id, embedding);
        console.log(`Embedded news id=${id}`);
      } catch (err) {
        if (attempts < MAX_EMBED_RETRIES) {
          console.warn(
            `Retrying embed id=${id} (attempt ${attempts + 2}): ${(err as Error).message}`,
          );
          embedQueue.push({
            id,
            title,
            content,
            url,
            datetime,
            attempts: attempts + 1,
          });
        } else {
          console.error(`Failed embedding/news save for id=${id}:`, err);
        }
      }
    }
  };

  const crawlWorkers = Array.from(
    { length: Math.min(CRAWL_CONCURRENCY, crawlQueue.length) },
    () => crawlWorker(),
  );
  const embedWorkers = Array.from(
    { length: Math.min(EMBED_CONCURRENCY, crawlQueue.length) },
    () => embedWorker(),
  );

  await Promise.all([...crawlWorkers, ...embedWorkers]);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
