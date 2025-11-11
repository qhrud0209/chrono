import Link from 'next/link';
import { Noto_Sans_KR, Plus_Jakarta_Sans } from 'next/font/google';

import { listCuratedTimelines } from '@/app/chronology/timelineData';
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

const curated = listCuratedTimelines();

export default function Page() {
  return (
    <div
      className={`${styles.page} ${plusJakarta.variable} ${notoSans.variable}`}
    >
      <main className={styles.main}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Chronology Lab</p>
          <h1 className={styles.title}>키워드별 주요 사건 타임라인</h1>
          <p className={styles.subtitle}>
            생성형 요약과 뉴스 큐레이션으로 정리한 예시 키워드를 열람해
            보세요. 각 카드에서 타임라인 데모 페이지로 바로 이동할 수 있습니다.
          </p>
        </header>

        <section className={styles.gridSection} aria-label="샘플 타임라인 목록">
          <div className={styles.grid}>
            {curated.map((timeline) => (
              <Link
                key={timeline.keywordId}
                href={`/chronology/${timeline.keywordId}`}
                className={styles.card}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>Keyword</p>
                    <h2 className={styles.cardTitle}>
                      {timeline.keywordLabel}
                    </h2>
                  </div>
                  <span className={styles.eventCount}>
                    {timeline.totalEvents}건
                  </span>
                </div>
                <p className={styles.cardIntro}>{timeline.intro}</p>
                {timeline.latestEvent && (
                  <div className={styles.latest}>
                    <p className={styles.latestLabel}>latest</p>
                    <p className={styles.latestDate}>
                      {timeline.latestEvent.dateLabel}
                    </p>
                    <p className={styles.latestTitle}>
                      {timeline.latestEvent.title}
                    </p>
                  </div>
                )}
                <span className={styles.cardCta}>타임라인 열기 →</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
