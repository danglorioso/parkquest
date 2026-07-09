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

export async function notifyAdmin(alert: AdminAlert) {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey || !adminEmail) return;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'ParkQuest Moderation <moderation@parkquest.me>',
    to: adminEmail,
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
