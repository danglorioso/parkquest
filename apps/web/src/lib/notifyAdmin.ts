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
