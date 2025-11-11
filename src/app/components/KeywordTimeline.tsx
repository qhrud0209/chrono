import styles from './KeywordTimeline.module.css';
import { KeywordTimeline } from '@/app/chronology/timelineData';

type KeywordTimelineProps = {
  timeline: KeywordTimeline;
};

const TAG_LABELS: Record<string, string> = {
  launch: '발표',
  supply: '공급망',
  policy: '정책',
  rumor: '루머',
};

const formatArticleDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
};

const KeywordTimelineView = ({ timeline }: KeywordTimelineProps) => {
  return (
    <section
      className={styles.timelineSection}
      aria-label={`${timeline.keywordLabel} 주요 사건 타임라인`}
    >
      <div className={styles.timelineScroller}>
        <ol className={styles.timelineRow}>
          {timeline.events.map((event) => (
            <li key={event.id} className={styles.timelineStop}>
              <div className={styles.markerRow} aria-hidden="true">
                <span className={styles.node} />
              </div>
              <article className={styles.card} tabIndex={0}>
                <div className={styles.cardHeader}>
                  <span className={styles.date}>{event.dateLabel}</span>
                  {event.tag && TAG_LABELS[event.tag] && (
                    <span className={`${styles.tag} ${styles[event.tag]}`}>
                      {TAG_LABELS[event.tag]}
                    </span>
                  )}
                </div>
                <h3 className={styles.eventTitle}>{event.title}</h3>
                <div className={styles.details}>
                  <p className={styles.summary}>{event.summary}</p>
                  {event.articles.length > 0 && (
                    <ul className={styles.articleList}>
                      {event.articles.map((article) => (
                        <li key={article.url} className={styles.articleItem}>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.articleLink}
                          >
                            <span className={styles.articleTitle}>
                              {article.title}
                            </span>
                            <span className={styles.articleMeta}>
                              {article.source}
                              {article.publishedAt && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  {formatArticleDate(article.publishedAt)}
                                </>
                              )}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default KeywordTimelineView;
