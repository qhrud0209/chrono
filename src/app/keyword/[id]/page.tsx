import { Noto_Sans_KR, Plus_Jakarta_Sans } from 'next/font/google';

import TopicGraph from '@/app/components/TopicGraph';
import { RelatedKeyword } from '@/app/components/topicGraphData';
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

const buildBaseCandidates = () => {
  const bases = new Set<string>();
  const candidates = [
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined,
  ];
  candidates.forEach((candidate) => {
    if (candidate && candidate.trim().length > 0) {
      bases.add(candidate);
    }
  });
  bases.add('http://localhost:3000');
  return Array.from(bases);
};

const fetchRelatedKeywords = async (keywordId: string) => {
  const endpointPath = `/api/keywords/related/${keywordId}`;
  const bases = buildBaseCandidates();

  for (const base of bases) {
    const normalizedBase = base.replace(/\/$/, '');
    const endpoint = `${normalizedBase}${endpointPath}`;
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

const KNOWN_KEYWORD_LABELS: Record<string, string> = {
  '36': 'WWDC25',
  '19': '아이폰 17',
};

const resolveCenterLabel = (id: string) => {
  const fromMap = KNOWN_KEYWORD_LABELS[id];
  if (fromMap) {
    return fromMap;
  }

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
};

const KeywordDetailPage = async ({ params }: PageProps) => {
  const resolvedParams = await Promise.resolve(params);
  const keywordId = resolvedParams.id;
  const centerLabel = resolveCenterLabel(keywordId);
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
