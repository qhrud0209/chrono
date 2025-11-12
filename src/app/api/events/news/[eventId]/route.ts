import { NextResponse } from 'next/server';

import { MOCK_NEWS } from '@/app/api/events/mockData';

type Params = {
  params: Promise<{ eventId: string }>,
};

export const GET = async (_req: Request, { params }: Params) => {
  const { eventId } = await params;
  const numericId = Number(eventId);
  const news = Number.isNaN(numericId) ? [] : MOCK_NEWS[numericId] ?? [];
  return NextResponse.json({
    content: news,
  });
};
