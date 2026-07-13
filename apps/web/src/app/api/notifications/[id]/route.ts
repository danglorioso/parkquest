import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const notificationId = Number(id);
    if (!Number.isInteger(notificationId)) {
      return NextResponse.json({ error: 'Invalid notification id' }, { status: 400 });
    }

    const { read } = await request.json();
    if (typeof read !== 'boolean') {
      return NextResponse.json({ error: 'read must be a boolean' }, { status: 400 });
    }

    await db.update(notifications).set({ read }).where(
      and(eq(notifications.id, notificationId), eq(notifications.recipient_id, userId))
    );

    return NextResponse.json({ message: 'Updated' });
  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const notificationId = Number(id);
    if (!Number.isInteger(notificationId)) {
      return NextResponse.json({ error: 'Invalid notification id' }, { status: 400 });
    }

    await db.delete(notifications).where(
      and(eq(notifications.id, notificationId), eq(notifications.recipient_id, userId))
    );

    return NextResponse.json({ message: 'Dismissed' });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    return NextResponse.json({ error: 'Failed to dismiss notification' }, { status: 500 });
  }
}
