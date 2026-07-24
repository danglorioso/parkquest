import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { userIntegrations } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await db
    .delete(userIntegrations)
    .where(and(eq(userIntegrations.clerk_user_id, userId), eq(userIntegrations.provider, 'strava')));

  return NextResponse.json({ message: 'Strava disconnected' });
}
