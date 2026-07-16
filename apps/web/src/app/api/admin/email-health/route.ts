import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdmin } from '@/lib/admin';

// GET — reports whether RESEND_API_KEY is set and the key actually works,
// plus the verification status of every sending domain on the account. A
// domain stuck at "pending"/"failed" is the usual reason emails never land.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, apiKeyValid: false, domains: [], error: 'RESEND_API_KEY is not set' });
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.domains.list();
  if (error) {
    return NextResponse.json({ configured: true, apiKeyValid: false, domains: [], error: error.message });
  }

  return NextResponse.json({
    configured: true,
    apiKeyValid: true,
    domains: (data?.data ?? []).map(d => ({ name: d.name, status: d.status, region: d.region })),
  });
}

// POST — sends a real test email to the signed-in admin's own address, using
// the same sender identity as the automated admin alerts, so a successful
// send here means those alerts should actually be landing too.
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 });

  const to = admin.primaryEmailAddress?.emailAddress;
  if (!to) return NextResponse.json({ error: 'No email address on your Clerk account' }, { status: 400 });

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: 'ParkQuest <notifications@parkquest.me>',
    to,
    subject: 'ParkQuest test email',
    text: [
      'This is a test email from the ParkQuest admin dashboard.',
      `Sent: ${new Date().toISOString()}`,
      '',
      "If you're reading this, Resend is delivering correctly.",
    ].join('\n'),
  });

  if (error) {
    return NextResponse.json({ error: error.message || 'Send failed' }, { status: 502 });
  }

  return NextResponse.json({ sent: true, id: data?.id, to });
}
