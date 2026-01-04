import { NextResponse } from "next/server";
import { extractArticleFromUrl } from "@/lib/articleCrawler";

export const runtime = "nodejs"; // needs fetch, TextDecoder, and env access

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const maxInputChars = searchParams.get("maxInputChars");
  const maxOutputTokens = searchParams.get("maxOutputTokens");

  if (!url || !url.trim()) {
    return NextResponse.json({ error: "Missing url query param" }, { status: 400 });
  }

  try {
    const result = await extractArticleFromUrl(url.trim(), {
      maxInputChars: maxInputChars ? Number(maxInputChars) : undefined,
      maxOutputTokens: maxOutputTokens ? Number(maxOutputTokens) : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
