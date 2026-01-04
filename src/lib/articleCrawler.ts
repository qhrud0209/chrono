const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface ArticleExtractionResponse {
  title?: string;
  content?: string;
  language?: string;
  canonicalUrl?: string;
  isSummary?: boolean;
}

export interface ArticleExtractionResult {
  url: string;
  title?: string;
  content: string;
  language?: string;
  canonicalUrl?: string;
  model: string;
  rawHtmlLength: number;
  truncatedHtmlLength: number;
  encoding: string;
  isSummary?: boolean;
}

export interface ExtractArticleOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  openAiTimeoutMs?: number;
  maxInputChars?: number;
  maxOutputTokens?: number;
  contentCharLimit?: number;
  summaryOnly?: boolean;
  summaryMinWords?: number;
  summaryMaxWords?: number;
}

const CHARSET_REGEX = /charset\s*=\s*["']?([^"'>\s]+)/i;
const META_HTTP_EQUIV_REGEX = /<meta\s+http-equiv=["']content-type["'][^>]*>/i;

const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_OPENAI_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_INPUT_CHARS = 120_000;
const DEFAULT_CONTENT_CHAR_LIMIT = 8_000;
const DEFAULT_SUMMARY_MIN_WORDS = 120;
const DEFAULT_SUMMARY_MAX_WORDS = 240;

function parseCharsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = contentType.match(CHARSET_REGEX);
  return match ? match[1].toLowerCase() : null;
}

function sniffCharsetFromHtml(buffer: Buffer): string | null {
  const head = buffer.toString("ascii", 0, Math.min(buffer.length, 8192));
  const metaCharset = head.match(/<meta[^>]+charset=["']?([^"'>\s]+)/i);
  if (metaCharset) return metaCharset[1].toLowerCase();

  const httpEquiv = head.match(META_HTTP_EQUIV_REGEX);
  if (httpEquiv) {
    const charsetMatch = httpEquiv[0].match(CHARSET_REGEX);
    if (charsetMatch) return charsetMatch[1].toLowerCase();
  }

  return null;
}

function detectEncoding(contentType: string | null, buffer: Buffer): string {
  return parseCharsetFromContentType(contentType) || sniffCharsetFromHtml(buffer) || "utf-8";
}

function sanitizeHtml(html: string, maxChars: number): { sanitized: string; truncatedHtmlLength: number } {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length > maxChars) {
    return { sanitized: stripped.slice(0, maxChars), truncatedHtmlLength: maxChars };
  }

  return { sanitized: stripped, truncatedHtmlLength: stripped.length };
}

async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string; encoding: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch page (${res.status}): ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type");
    const buffer = Buffer.from(await res.arrayBuffer());
    const encoding = detectEncoding(contentType, buffer);

    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(encoding, { fatal: false });
    } catch {
      decoder = new TextDecoder("utf-8", { fatal: false });
    }

    const html = decoder.decode(buffer);

    return { html, finalUrl: res.url, encoding };
  } catch (error: unknown) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`Fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonContent(messageContent: string): ArticleExtractionResponse {
  const tryParse = (text: string) => {
    try {
      return JSON.parse(text) as ArticleExtractionResponse;
    } catch {
      return null;
    }
  };

  const trimmed = messageContent.trim();

  // direct parse
  const direct = tryParse(trimmed);
  if (direct) return direct;

  // code fence wrapped
  const fenced = trimmed.match(/```(?:json)?\\s*([\\s\\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  // best-effort bracket slice
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const sliced = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(sliced);
    if (parsed) return parsed;
  }

  // attempt to repair simple truncation (e.g., missing closing quote/brace)
  if (firstBrace !== -1) {
    let candidate = trimmed.slice(firstBrace);
    if (!candidate.trim().endsWith("}")) {
      candidate = `${candidate}"}`;
    } else {
      const quoteCount = (candidate.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        candidate = `${candidate}"`;
      }
    }
    const repaired = tryParse(candidate);
    if (repaired) return repaired;
  }

  throw new Error(`OpenAI returned non-JSON content: ${trimmed.slice(0, 300)}`);
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  timeoutMs: number,
  systemContent: string,
): Promise<ArticleExtractionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemContent,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 240)}`);
    }

    const data = await res.json();
    const messageContent = data?.choices?.[0]?.message?.content;

    if (!messageContent || typeof messageContent !== "string") {
      throw new Error("OpenAI API returned an unexpected response format");
    }

    return parseJsonContent(messageContent);
  } catch (error: unknown) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`OpenAI call timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Crawls a news article page and extracts its main body text using GPT.
 * This helper is server-side only; do not run from the browser.
 */
export async function extractArticleFromUrl(
  url: string,
  options: ExtractArticleOptions = {},
): Promise<ArticleExtractionResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OpenAI API key. Set OPENAI_API_KEY or pass options.apiKey.");
  }

  const model = options.model || DEFAULT_MODEL;
  const fetchTimeout = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const openAiTimeout = options.openAiTimeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  const maxOutputTokens = options.maxOutputTokens ?? 3000;
  const contentCharLimit = options.contentCharLimit ?? DEFAULT_CONTENT_CHAR_LIMIT;
  const summaryOnly = options.summaryOnly ?? false;
  const summaryMinWords = options.summaryMinWords ?? DEFAULT_SUMMARY_MIN_WORDS;
  const summaryMaxWords = options.summaryMaxWords ?? DEFAULT_SUMMARY_MAX_WORDS;

  const { html, finalUrl, encoding } = await fetchHtml(url, fetchTimeout);
  const { sanitized, truncatedHtmlLength } = sanitizeHtml(html, maxInputChars);

  const prompt = summaryOnly
    ? `Source URL: ${finalUrl}\n\nSummarize the main article content in ${summaryMinWords}-${summaryMaxWords} words. Preserve who/what/when/where/why/how and key numbers/quotes. No bullets. Keep the article's original language.\n\nHTML content (sanitized):\n${sanitized}`
    : `Source URL: ${finalUrl}\n\nMax content length: ${contentCharLimit} characters. If longer, truncate content string but keep JSON valid.\n\nHTML content (sanitized):\n${sanitized}`;

  const systemContent = summaryOnly
    ? `You extract and summarize the main news article from messy HTML. Return STRICT JSON only with fields: title (string), content (a ${summaryMinWords}-${summaryMaxWords} word summary in the original language capturing all key facts), language (BCP-47 code if clear), canonicalUrl (if present), isSummary (boolean true). Exclude navigation, recommendations, ads, comments, or scripts. No bullet lists. Always return valid JSON even if you must truncate with an ellipsis at the end of the content string.`
    : `You extract the main news article body from messy HTML. Return STRICT JSON only with fields: title (string), content (the readable article body with paragraph breaks), language (BCP-47 code if clear), canonicalUrl (if present), isSummary (boolean false). Exclude captions, navigation, recommendations, ads, comments, or scripts. Keep the original language and do not summarize. If content is long, you MAY truncate the content string with an ellipsis but MUST return valid JSON and close all braces.`;

  const extraction = await callOpenAI(prompt, apiKey, model, maxOutputTokens, openAiTimeout, systemContent);

  return {
    url: finalUrl,
    title: extraction.title,
    content: extraction.content?.trim() || "",
    language: extraction.language,
    canonicalUrl: extraction.canonicalUrl,
    model,
    rawHtmlLength: html.length,
    truncatedHtmlLength,
    encoding,
    isSummary: extraction.isSummary ?? summaryOnly,
  };
}
