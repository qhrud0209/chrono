import { redirect } from 'next/navigation';

const fallbackKeywordId = '36';

export default function Page() {
  redirect(`/chronology/${fallbackKeywordId}`);
}
