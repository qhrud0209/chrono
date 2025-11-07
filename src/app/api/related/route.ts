import { NextResponse } from "next/server";
import { getSimilarWords } from "@/lib/wordSource";

export const runtime = "nodejs"; // ensure Node APIs available

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) return NextResponse.json({ related: [] });

  try {
    const related = await getSimilarWords(q, 8);
    return NextResponse.json({ related });
  } catch {
    return NextResponse.json({ related: [] }, { status: 200 });
  }
}
