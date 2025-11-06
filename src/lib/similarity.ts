export function normalize(input: string): string {
  return input.normalize("NFC").trim().toLowerCase();
}

export function ngrams(text: string, n = 3): Set<string> {
  const s = ` ${normalize(text)} `; // light padding to capture edges
  const grams = new Set<string>();
  if (s.length <= n) {
    grams.add(s);
    return grams;
  }
  for (let i = 0; i <= s.length - n; i++) {
    grams.add(s.slice(i, i + n));
  }
  return grams;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (normalize(a) === normalize(b)) return 1;
  return jaccard(ngrams(a), ngrams(b));
}

