// app/api/events/news/[event_id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

interface Row extends RowDataPacket {
  newsId: number;
  media: string | null;
  headline: string | null;
  URL: string | null; // 스펙이 대문자 URL이라 그대로 반환
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ 이제 context 안 쓰고, URL 경로에서만 event_id 추출
function getEventId(req: NextRequest): string {
  const { pathname } = new URL(req.url);
  const last = (pathname.split("/").pop() || "").trim();
  return last || "";
}

export async function GET(req: NextRequest, _context: any) {
  const idRaw = getEventId(req);
  const idNum = Number(idRaw);

  if (!idRaw || Number.isNaN(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  try {
    const sql = `
      SELECT
        n.id       AS newsId,
        n.media    AS media,
        n.headline AS headline,
        n.URL      AS URL
      FROM news n
      WHERE n.event_id = ?
      ORDER BY n.id DESC
    `;
    const [rows] = await pool.query<Row[]>(sql, [idNum]);

    return NextResponse.json({ content: rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "db error" },
      { status: 500 }
    );
  }
}
