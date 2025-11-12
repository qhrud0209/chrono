import { Noto_Sans_KR, Plus_Jakarta_Sans } from 'next/font/google';

import KeywordTimeline from '@/app/components/KeywordTimeline';
import { buildTimelineForKeyword } from '@/app/chronology/timelineData';
import styles from './page.module.css';

const notoSans = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
  variable: '--font-noto-sans-kr',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const timeline = await buildTimelineForKeyword(id);

  return (
    <div
      className={`${styles.page} ${plusJakarta.variable} ${notoSans.variable}`}
    >
      <main className={styles.main}>
        <header className={styles.header}>
          <span className={styles.label}>Keyword chronology</span>
          <h1 className={styles.title}>{timeline.keywordLabel}</h1>
          <p className={styles.intro}>{timeline.intro}</p>
        </header>
        <KeywordTimeline timeline={timeline} />
      </main>
    </div>
  );
}
