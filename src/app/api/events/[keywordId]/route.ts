import { NextResponse } from 'next/server';

import { MOCK_EVENTS } from '@/app/api/events/mockData';

type Params = {
  params: Promise<{ keywordId: string }>,
};

export const GET = async (_req: Request, { params }: Params) => {
  const { keywordId } = await params;
  const events = MOCK_EVENTS[keywordId] ?? [];
  return NextResponse.json({
    content: events,
  });
};
