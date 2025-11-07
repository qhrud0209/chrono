import path from "path";
import fs from "fs/promises";
import { similarity, normalize } from "./similarity";

export type WordEntry = string | { term: string; freq?: number; id?: number };

let cache: { words: { term: string; freq: number }[] } | null = null;

async function readWordsFromFile(): Promise<{ term: string; freq: number; id?: number }[]> {
  const tryFiles = [
    process.env.WORDS_FILE,
    path.join(process.cwd(), "data", "words.txt"),
    path.join(process.cwd(), "data", "words.json"),
  ].filter(Boolean) as string[];

  for (const file of tryFiles) {
    try {
      const buf = await fs.readFile(file, "utf8");
      if (file.endsWith(".txt")) {
        const items = buf
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((term) => ({ term, freq: 0 }));
        if (items.length) return items;
      } else if (file.endsWith(".json")) {
        const json = JSON.parse(buf) as WordEntry[];
        const items = json
          .map((w) =>
            typeof w === "string"
              ? { term: w, freq: 0 }
              : { term: w.term, freq: w.freq ?? 0, id: w.id }
          )
          .filter((x) => x.term && typeof x.term === "string");
        if (items.length) return items;
      }
    } catch {
      // ignore and try next
    }
  }
  return [];
}

export async function loadWordList(): Promise<{ term: string; freq: number; id?: number }[]> {
  if (cache) return cache.words;
  const words = await readWordsFromFile();
  cache = { words };
  return words;
}

export async function getSimilarWords(q: string, limit = 10): Promise<string[]> {
  const base = normalize(q);
  const list = await loadWordList();
  if (list.length === 0) return [];

  const scored = list
    .filter((w) => normalize(w.term) !== base)
    .map((w) => ({
      term: w.term,
      score: similarity(base, w.term) + Math.min(1, (w.freq || 0) / 100000),
    }))
    .filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.term);
}
