'use client';

import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
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
  const [pinnedMap, setPinnedMap] = useState<Record<string, boolean>>({});
  const [hoverSuppressedMap, setHoverSuppressedMap] = useState<
    Record<string, boolean>
  >({});

  const setPinnedState = (eventId: string, shouldPin: boolean) => {
    setPinnedMap(prev => {
      const isAlreadyPinned = Boolean(prev[eventId]);
      if (shouldPin === isAlreadyPinned) {
        return prev;
      }
      const next = { ...prev };
      if (shouldPin) {
        next[eventId] = true;
      } else {
        delete next[eventId];
      }
      return next;
    });

    if (shouldPin) {
      setHoverSuppressedMap(prev => {
        if (!prev[eventId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    }
  };

  const setHoverSuppressed = (eventId: string, shouldSuppress: boolean) => {
    setHoverSuppressedMap(prev => {
      const isSuppressed = Boolean(prev[eventId]);
      if (shouldSuppress === isSuppressed) {
        return prev;
      }
      if (shouldSuppress) {
        return { ...prev, [eventId]: true };
      }
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  };

  return (
    <section
      className={styles.timelineSection}
      aria-label={`${timeline.keywordLabel} 주요 사건 타임라인`}
    >
      <div className={styles.timelineScroller}>
        <ol className={styles.timelineRow}>
          {timeline.events.map((event) => {
            const eventTitle =
              event.title.trim() || '이벤트 상세 정보가 제공되지 않았습니다';
            const summaryText = (event.summary ?? '').trim();
            const hasSummary = summaryText.length > 0;

            const tagSlug = event.tag?.trim();
            const tagLabel = tagSlug ? TAG_LABELS[tagSlug] ?? tagSlug : null;
            const tagClassName =
              tagSlug && styles[tagSlug] ? `${styles[tagSlug]}` : '';

            const isPinned = Boolean(pinnedMap[event.id]);
            const isHoverSuppressed = Boolean(
              hoverSuppressedMap[event.id],
            );
            const cardClassName = [
              styles.card,
              isPinned ? styles.cardPinned : '',
              isHoverSuppressed ? styles.cardHoverSuppressed : '',
            ]
              .filter(Boolean)
              .join(' ');

            const handleCardClick = (evt: MouseEvent<HTMLElement>) => {
              const target = evt.target as HTMLElement | null;
              if (target?.closest('a')) {
                return;
              }
              const willPin = !isPinned;
              setPinnedState(event.id, willPin);
              if (!willPin) {
                setHoverSuppressed(event.id, true);
                evt.currentTarget.blur();
              }
            };

            const handleCardKeyDown = (evt: KeyboardEvent<HTMLElement>) => {
              if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault();
                const willPin = !isPinned;
                setPinnedState(event.id, willPin);
                if (!willPin) {
                  setHoverSuppressed(event.id, true);
                  evt.currentTarget.blur();
                }
              }
            };

            const handleMouseLeave = () => {
              if (hoverSuppressedMap[event.id]) {
                setHoverSuppressed(event.id, false);
              }
            };

            return (
              <li key={event.id} className={styles.timelineStop}>
                <div className={styles.markerRow} aria-hidden="true">
                  <span className={styles.node} />
                </div>
                <article
                  className={cardClassName}
                  tabIndex={0}
                  onClick={handleCardClick}
                  onKeyDown={handleCardKeyDown}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.date}>{event.dateLabel}</span>
                    {tagLabel && (
                      <span
                        className={`${styles.tag} ${tagClassName}`.trim()}
                      >
                        {tagLabel}
                      </span>
                    )}
                  </div>
                  <h3 className={styles.eventTitle}>{eventTitle}</h3>
                  <div className={styles.details}>
                    {hasSummary && (
                      <p className={styles.summary}>{summaryText}</p>
                    )}
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
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default KeywordTimelineView;
