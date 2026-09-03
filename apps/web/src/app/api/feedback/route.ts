import { NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { notifyAdminFeedback } from '@/lib/notifyAdmin';

const CATEGORIES = ['bug', 'suggestion', 'question', 'other'] as const;

// POST /api/feedback { category, page?, message, contactName?, contactEmail? }
// user_id is always attached server-side from the auth'd session, even when
// the submitter leaves contact info blank — see schema.ts comment.
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { category, page, message, contactName, contactEmail } = await request.json();

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (!message || !String(message).trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const [inserted] = await db
      .insert(feedback)
      .values({
        user_id: userId,
        category,
        page: page ? String(page).slice(0, 100) : null,
        message: String(message).trim().slice(0, 4000),
        contact_name: contactName ? String(contactName).trim().slice(0, 255) : null,
        contact_email: contactEmail ? String(contactEmail).trim().slice(0, 255) : null,
      })
      .returning();

    if (inserted) {
      after(() => notifyAdminFeedback({
        feedbackId: inserted.id,
        userId,
        category: inserted.category,
        page: inserted.page,
        message: inserted.message,
        contactName: inserted.contact_name,
        contactEmail: inserted.contact_email,
      }).catch(() => {}));
    }

    return NextResponse.json({ message: 'Feedback submitted' });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
