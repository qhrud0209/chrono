const normalizeBaseUrl = (base: string) => {
  return base.replace(/\/$/, '');
};

export const buildApiBaseCandidates = () => {
  const bases = new Set<string>();
  const candidates = [
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  candidates.forEach((candidate) => {
    if (candidate && candidate.trim().length > 0) {
      bases.add(normalizeBaseUrl(candidate.trim()));
    }
  });

  bases.add('http://localhost:3000');
  return Array.from(bases);
};

export const buildEndpointUrl = (base: string, path: string) => {
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};
