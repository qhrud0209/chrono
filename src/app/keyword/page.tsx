import { redirect } from 'next/navigation';

type PageProps = {
  searchParams?: {
    q?: string | string[],
  },
};

const DEFAULT_KEYWORD_ID = '36';

const normalizeQuery = (query: string | string[] | undefined) => {
  if (!query) {
    return undefined;
  }
  return Array.isArray(query) ? query[0] : query;
};

const KeywordLandingPage = ({ searchParams }: PageProps) => {
  const query = normalizeQuery(searchParams?.q)?.trim();
  const keywordId = query && query.length > 0 ? query : DEFAULT_KEYWORD_ID;

  redirect(`/keyword/${encodeURIComponent(keywordId)}`);
};

export default KeywordLandingPage;
