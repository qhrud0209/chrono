import { NextResponse } from "next/server";
import { loadWordList } from "@/lib/wordSource";
import { normalize, similarity } from "@/lib/similarity";

export const runtime = "nodejs";

function hashToInt32(str: string): number {
  // djb2 variant
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0) % 2147483647; // positive 32-bit
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || searchParams.get("q") || "").trim();

  if (!query) return NextResponse.json({ content: [] });

  const base = normalize(query);
  const list = await loadWordList();

  if (!list || list.length === 0) {
    return NextResponse.json({ content: [] });
  }

  const scored = list
    .filter((w) => normalize(w.term) !== base)
    .map((w) => ({
      term: w.term,
      id: w.id,
      score: similarity(base, w.term) + Math.min(1, (w.freq || 0) / 100000),
    }))
    .filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 10);

  const content = top.map((x) => ({
    keywordName: x.term,
    keywordId: typeof x.id === "number" ? x.id : hashToInt32(x.term),
  }));

  return NextResponse.json({ content });
}

