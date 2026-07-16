import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createUserProfileFromWebhook } from '@/lib/ensureUserProfile';

// Closes the gap where a user exists in Clerk but never gets a
// user_profiles row — previously that only happened reactively, via
// ensureUserProfile() inside routes the user themselves hit (post, like,
// comment, friend request). A user who signs up via Apple/Google SSO and
// never triggers one of those before someone else looks them up (e.g. a
// friend request landing on their username, or clicking through from a
// notification) hits a hard 404 with no profile to fall back to — the
// notification shows "Someone" and their profile page 404s, even though
// the account is real. This listens for Clerk's own `user.created` event
// so the row gets created unconditionally, at signup, regardless of which
// client flow (or none) runs afterward.
//
// Setup required in the Clerk Dashboard (Webhooks): endpoint URL
// https://www.parkquest.me/api/webhooks/clerk, subscribed to `user.created`,
// with the signing secret set here as CLERK_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  const body = await request.text();
  let event: { type: string; data: Record<string, unknown> };
  try {
    event = new Webhook(secret).verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event;
  } catch (error) {
    console.error('Clerk webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'user.created') {
    const data = event.data as {
      id: string;
      username: string | null;
      email_addresses: { email_address: string }[];
      first_name: string | null;
      last_name: string | null;
      image_url: string | null;
    };
    const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;
    try {
      await createUserProfileFromWebhook(data.id, {
        username: data.username,
        emailAddresses: data.email_addresses.map((e) => ({ emailAddress: e.email_address })),
        fullName,
        imageUrl: data.image_url,
      });
    } catch (error) {
      console.error('Error creating user_profiles row from Clerk webhook:', error);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
