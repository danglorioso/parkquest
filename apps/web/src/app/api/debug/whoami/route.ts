import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';

// Temporary diagnostic route — remove once the admin-role metadata issue is resolved.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const user = await currentUser();
  return NextResponse.json({
    userId,
    username: user?.username,
    primaryEmail: user?.primaryEmailAddress?.emailAddress,
    publicMetadata: user?.publicMetadata,
  });
}
