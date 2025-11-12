// app/api/events/[keyword_id]/route.ts
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

interface Row extends RowDataPacket {
  eventId: number;
  eventDateTime: string | null;
  summary: string | null;
  name: string | null;
  tag: string | null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getKeywordId(req: Request, context?: { params?: { keyword_id?: string } }) {
  // 1) params 우선
  const fromParams = context?.params?.keyword_id?.trim();
  if (fromParams) return fromParams;

  // 2) URL 폴백
  const { pathname } = new URL(req.url);
  const last = (pathname.split("/").pop() || "").trim();
  return last || "";
}

export async function GET(req: Request, context?: { params?: { keyword_id?: string } }) {
  const idRaw = getKeywordId(req, context);
  const idNum = Number(idRaw);

  if (!idRaw || Number.isNaN(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "keyword_id required" }, { status: 400 });
  }

  try {
    const sql = `
      SELECT
        e.id AS eventId,
        DATE_FORMAT(e.datetime, '%Y-%m-%d %H:%i:%s.%f') AS eventDateTime,
        e.summary AS summary,
        e.name AS name,
        e.tag AS tag
      FROM event e
      WHERE e.keyword_id = ?
      ORDER BY e.datetime DESC, e.id DESC
    `;
    const [rows] = await pool.query<Row[]>(sql, [idNum]);

    const content = rows.map(r => ({
      ...r,
      // 마이크로초(6) → 밀리초(3)
      eventDateTime: (r.eventDateTime ?? "").slice(0, 23),
    }));

    return NextResponse.json({ content });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "db error" }, { status: 500 });
  }
}
