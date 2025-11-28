// app/api/events/[keyword_id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface EventRow {
  id: number;
  datetime: string | null;
  summary: string | null;
  name: string | null;
  tag: string | null;
}

interface ResponseRow {
  eventId: number;
  eventDateTime: string | null;
  summary: string | null;
  name: string | null;
  tag: string | null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ Supabase 클라이언트 (env 기반)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl) {
  throw new Error("환경변수 NEXT_PUBLIC_SUPABASE_URL이 설정되어 있지 않습니다.");
}

if (!supabaseKey) {
  throw new Error("환경변수 SUPABASE_KEY가 설정되어 있지 않습니다.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// keyword_id 추출
function getKeywordId(
  req: Request,
  context?: { params?: { keyword_id?: string } }
) {
  // 1) params 우선
  const fromParams = context?.params?.keyword_id?.trim();
  if (fromParams) return fromParams;

  // 2) URL 폴백
  const { pathname } = new URL(req.url);
  const last = (pathname.split("/").pop() || "").trim();
  return last || "";
}

// "YYYY-MM-DD HH:mm:ss.SSS" 형태로 맞춰주는 헬퍼
function toMillisString(dt: string | null): string | null {
  if (!dt) return null;

  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) {
    // 형식 이상이면 일단 23글자 자르기
    return dt.slice(0, 23);
  }

  const iso = d.toISOString(); // "YYYY-MM-DDTHH:mm:ss.sssZ"
  // → "YYYY-MM-DD HH:mm:ss.SSS"
  return iso.replace("T", " ").replace("Z", "").slice(0, 23);
}

export async function GET(
  req: Request,
  context?: { params?: { keyword_id?: string } }
) {
  const idRaw = getKeywordId(req, context);
  const idNum = Number(idRaw);

  if (!idRaw || Number.isNaN(idNum) || idNum <= 0) {
    return NextResponse.json(
      { error: "keyword_id required" },
      { status: 400 }
    );
  }

  try {
    // Supabase에서 event 테이블 조회
    const { data, error } = await supabase
      .from("event")
      .select("id, datetime, summary, name, tag")
      .eq("keyword_id", idNum)
      .order("datetime", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: error.message ?? "supabase error" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as EventRow[];

    const content: ResponseRow[] = rows.map((r) => ({
      eventId: r.id,
      eventDateTime: toMillisString(r.datetime),
      summary: r.summary,
      name: r.name,
      tag: r.tag,
    }));

    return NextResponse.json({ content });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}
