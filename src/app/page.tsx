'use client';
import styles from './page.module.css';



import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = q.trim();
    if (query) {
      router.push(`/keyword?q=${encodeURIComponent(query)}`);
    }
  };

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setSuggestions([]);
      return;
    }

    // Special-case suggestions for queries including "apec"
    if (query.toLowerCase().includes('apec')) {
      setSuggestions(['apec', '寃쎌＜', '?몃읆??]);
      return;
    }

    // ?댁쟾 ?붿껌 痍⑥냼 ????而⑦듃濡ㅻ윭 ?앹꽦
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/related?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as { related?: string[] };
        setSuggestions(json.related ?? []);
      } catch (err: any) {
        // ?ъ슜?먭? ?낅젰??諛붽씀硫댁꽌 abort ??寃쎌슦??臾댁떆
        if (err?.name !== 'AbortError') {
          setSuggestions([]);
        }
      }
    }, 250);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  const choose = (term: string) => {
    router.push(`/keyword?q=${encodeURIComponent(term)}`);
  };

  return (
    <div>
      <section className={styles.mainHero}>
        <h1 className={styles.logo} aria-label="chrono">
          chrono
        </h1>

        <form
          className={styles.searchForm}
          action="/keyword"
          method="get"
          role="search"
          onSubmit={onSubmit}
        >
          <label htmlFor="q" className={styles.srOnly}>
            寃?됱뼱 ?낅젰
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="검색어를 입력하세요..."
            className={styles.searchInput}
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className={styles.searchButton}>검색</button>
        </form>

        {suggestions.length > 0 && (
          <div className={styles.suggestions} role="listbox" aria-label="유사 검색어">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className={styles.suggestionItem}
                onMouseDown={(e) => {
                  e.preventDefault(); // blur濡??명븳 dropdown ?ロ옒 諛⑹?
                  choose(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


