import { Resend } from 'resend';

interface AdminAlert {
  subject: string;
  reportId: number;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details?: string | null;
}

// Private inbox — only admins have access, so this is the "admins only"
// channel for these alerts. Never route signup/report alerts through the
// in-app notifications table or a push broadcast; both of those reach
// regular users.
const REPORTS_EMAIL = 'support@parkquest.me';

export async function notifyAdmin(alert: AdminAlert) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'ParkQuest Moderation <moderation@parkquest.me>',
    to: REPORTS_EMAIL,
    subject: alert.subject,
    text: [
      `Report #${alert.reportId}`,
      `Reporter: ${alert.reporterId}`,
      `Target: ${alert.targetType} ${alert.targetId}`,
      `Reason: ${alert.reason}`,
      alert.details ? `Details: ${alert.details}` : null,
      '',
      'Review in the admin dashboard: https://www.parkquest.me/admin/reports',
    ].filter(Boolean).join('\n'),
  });
}

interface FeedbackAlert {
  feedbackId: number;
  userId: string;
  category: string;
  page: string | null;
  message: string;
  contactName: string | null;
  contactEmail: string | null;
}

export async function notifyAdminFeedback(alert: FeedbackAlert) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'ParkQuest Feedback <feedback@parkquest.me>',
    to: REPORTS_EMAIL,
    subject: `ParkQuest feedback: ${alert.category}${alert.page ? ` — ${alert.page}` : ''}`,
    text: [
      `Feedback #${alert.feedbackId}`,
      `Category: ${alert.category}`,
      alert.page ? `Page: ${alert.page}` : null,
      `From: ${alert.contactName ?? '(anonymous)'}${alert.contactEmail ? ` <${alert.contactEmail}>` : ''}`,
      `User ID: ${alert.userId}`,
      '',
      alert.message,
    ].filter(Boolean).join('\n'),
  });
}

interface NewUserAlert {
  clerkUserId: string;
  username: string;
  displayName: string | null;
}

export async function notifyAdminNewUser(alert: NewUserAlert) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'ParkQuest <notifications@parkquest.me>',
    to: REPORTS_EMAIL,
    subject: `ParkQuest: new user — @${alert.username}`,
    text: [
      `New signup: @${alert.username}${alert.displayName ? ` (${alert.displayName})` : ''}`,
      `Clerk ID: ${alert.clerkUserId}`,
      '',
      `Profile: https://www.parkquest.me/profile/${alert.username}`,
    ].join('\n'),
  });
}
