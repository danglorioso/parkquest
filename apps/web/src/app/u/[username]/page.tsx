import { redirect } from 'next/navigation';

// Universal Link landing route. On iOS devices with ParkQuest installed the
// app intercepts /u/* before this page ever loads; everyone else (desktop,
// Android, no app) is sent to the public web profile.
export default async function ShareLinkRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  redirect(`/profile/${encodeURIComponent(username)}`);
}
