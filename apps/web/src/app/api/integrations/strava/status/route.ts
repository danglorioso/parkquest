import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { userIntegrations } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db
    .select({ clerk_user_id: userIntegrations.clerk_user_id })
    .from(userIntegrations)
    .where(and(eq(userIntegrations.clerk_user_id, userId), eq(userIntegrations.provider, 'strava')))
    .limit(1);

  return NextResponse.json({ connected: !!row });
}
