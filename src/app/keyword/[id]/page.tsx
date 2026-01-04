import { Noto_Sans_KR, Plus_Jakarta_Sans } from 'next/font/google';

import TopicGraph from '@/app/components/TopicGraph';
import { RelatedKeyword } from '@/app/components/topicGraphData';
import { buildApiBaseCandidates, buildEndpointUrl } from '@/lib/apiBase';
import { getServiceSupabaseClient } from '@/lib/newsVectors';
import styles from './page.module.css';

type PageProps = {
  params: { id: string } | Promise<{ id: string }>;
};

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans-kr',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

type RelatedKeywordsResponse = {
  content?: RelatedKeyword[];
};

type KeywordRow = {
  id: number;
  keyword: string;
};

const KEYWORD_TABLE = process.env.KEYWORD_TABLE?.trim() || 'keyword';

const parseId = (value: string): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeKeywordInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const decoded = decodeURIComponent(trimmed);
    return decoded.trim() || null;
  } catch {
    return trimmed;
  }
};

const fetchKeywordLabelById = async (
  id: number,
): Promise<string | null> => {
  const { data, error } = await getServiceSupabaseClient()
    .from(KEYWORD_TABLE)
    .select('id, keyword')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch keyword ${id}: ${error.message}`);
  }

  return ((data || []) as KeywordRow[])[0]?.keyword ?? null;
};

const fetchKeywordLabelByName = async (
  keyword: string,
): Promise<string | null> => {
  const client = getServiceSupabaseClient();
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const { data, error } = await client
    .from(KEYWORD_TABLE)
    .select('id, keyword')
    .eq('keyword', trimmed)
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to fetch keyword "${trimmed}": ${error.message}`,
    );
  }

  if (data && data.length > 0) {
    return (data as KeywordRow[])[0]?.keyword ?? null;
  }

  const { data: ilikeData, error: ilikeError } = await client
    .from(KEYWORD_TABLE)
    .select('id, keyword')
    .ilike('keyword', trimmed)
    .limit(1);

  if (ilikeError) {
    throw new Error(
      `Failed to fetch keyword "${trimmed}": ${ilikeError.message}`,
    );
  }

  return (ilikeData as KeywordRow[] | null)?.[0]?.keyword ?? null;
};

const fetchRelatedKeywords = async (keywordId: string) => {
  const endpointPath = `/api/keywords/related/${keywordId}`;
  const bases = buildApiBaseCandidates();

  for (const base of bases) {
    const endpoint = buildEndpointUrl(base, endpointPath);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) {
        continue;
      }
      const data = (await response.json()) as RelatedKeywordsResponse;
      if (data.content && data.content.length > 0) {
        return data.content;
      }
    } catch (error) {
      console.error(`Failed to load related keywords from ${endpoint}`, error);
    }
  }

  return [];
};

const resolveCenterLabel = async (id: string) => {
  const fallback = (() => {
    try {
      const decoded = decodeURIComponent(id);
      const trimmed = decoded.trim();
      if (trimmed && trimmed.toLowerCase() !== 'undefined') {
        return trimmed;
      }
    } catch {
      // ignore decode errors
    }
    return id && id.toLowerCase() !== 'undefined' ? id : '중심 키워드';
  })();

  try {
    const numericId = parseId(id);
    if (numericId !== null) {
      const label = await fetchKeywordLabelById(numericId);
      if (label?.trim()) {
        return label.trim();
      }
    }

    const keywordName = normalizeKeywordInput(id);
    if (keywordName) {
      const label = await fetchKeywordLabelByName(keywordName);
      if (label?.trim()) {
        return label.trim();
      }
      return keywordName;
    }
  } catch (error) {
    console.error('Failed to resolve keyword label', error);
  }

  return fallback;
};

const KeywordDetailPage = async ({ params }: PageProps) => {
  const resolvedParams = await Promise.resolve(params);
  const keywordId = resolvedParams.id;
  const centerLabel = await resolveCenterLabel(keywordId);
  const relatedKeywords = await fetchRelatedKeywords(keywordId);

  return (
    <div
      className={`${styles.page} ${plusJakarta.variable} ${notoSansKr.variable}`}
    >
      <main className={styles.main}>
        <h1 className={styles.title}>{centerLabel}</h1>
        <div className={styles.graph}>
          <TopicGraph
            center={{ id: keywordId, label: centerLabel }}
            related={relatedKeywords}
          />
        </div>
      </main>
    </div>
  );
};

export default KeywordDetailPage;
