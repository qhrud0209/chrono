'use client';
import styles from './page.module.css';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<
    { id: number; keyword: string }[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = q.trim();
    if (query) {
      try {
        const res = await fetch(
          `/api/related?q=${encodeURIComponent(query)}&limit=1`,
        );
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as {
          related?: { id: number; keyword: string }[];
        };
        const top = json.related?.[0];
        if (top) {
          router.push(`/keyword/${encodeURIComponent(String(top.id))}`);
          return;
        }
      } catch {
        // fall through to keyword query
      }
      router.push(`/keyword?q=${encodeURIComponent(query)}`);
    }
  };

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      abortRef.current?.abort();
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    // 이전 요청 취소 후 새 컨트롤러 생성
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/related?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as {
          related?: { id: number; keyword: string }[];
        };
        if (requestId !== requestIdRef.current) return;
        setSuggestions(json.related ?? []);
      } catch (err: any) {
        // 사용자가 입력을 바꾸면서 abort 된 경우는 무시
        if (requestId !== requestIdRef.current) return;
        if (err?.name !== 'AbortError') setSuggestions([]);
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  const choose = (item: { id: number; keyword: string }) => {
    router.push(`/keyword/${encodeURIComponent(String(item.id))}`);
  };

  return (
    <div>
      <section className="main-hero">
        <h1 className="logo" aria-label="chrono">
          chrono
        </h1>

        <form
          className="search-form"
          action="/keyword"
          method="get"
          role="search"
          onSubmit={onSubmit}
        >
          <label htmlFor="q" className="sr-only">
            검색어 입력
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="검색어를 입력하세요..."
            className="search-input"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="search-button">
            검색
          </button>
        </form>

        {isLoading && (
          <div className="suggestions-loading" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span className="sr-only">연관 키워드 불러오는 중</span>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="suggestions" role="listbox" aria-label="유사 검색어">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="suggestion-item"
                onMouseDown={(e) => {
                  e.preventDefault(); // blur로 인한 dropdown 닫힘 방지
                  choose(s);
                }}
              >
                {s.keyword}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
//hi
