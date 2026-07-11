import type { Metadata } from 'next';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, parks, userProfiles, visits } from '@/lib/db/schema';
import { PostFallbackClient } from './PostFallbackClient';

// TODO: set once the app is live on the App Store (numeric App Store ID for
// the apple-itunes-app smart banner, e.g. "6474123456")
export const APP_STORE_ID: string | null = null;
export const APP_STORE_URL: string | null = null;

async function getMetaPost(id: string) {
  const postId = Number(id);
  if (isNaN(postId)) return null;
  const [post] = await db
    .select({
      caption: posts.caption,
      photos: posts.photos,
      park_name: parks.name,
      display_name: userProfiles.display_name,
      username: userProfiles.username,
      visibility: sql<string>`COALESCE(${visits.visibility}, ${posts.visibility}, 'public')`,
    })
    .from(posts)
    .leftJoin(parks, eq(posts.park_code, parks.park_code))
    .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
    .leftJoin(visits, eq(posts.visit_id, visits.id))
    .where(eq(posts.id, postId))
    .limit(1);
  return post ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getMetaPost(id);

  // Only public posts get a real preview — private/friends-only posts (and
  // missing posts) fall back to a generic teaser so nothing leaks to crawlers.
  if (!post || post.visibility !== 'public') {
    return {
      title: 'A post on ParkQuest',
      description: "Download ParkQuest to see this post and follow friends' national park adventures.",
    };
  }

  const author = post.display_name || (post.username ? `@${post.username}` : 'A ParkQuest explorer');
  const title = post.park_name ? `${author} at ${post.park_name}` : `A post from ${author}`;
  const description = post.caption || `See ${author}'s national park adventure on ParkQuest.`;
  const image = Array.isArray(post.photos) && post.photos.length > 0
    ? (typeof post.photos[0] === 'string' ? post.photos[0] : (post.photos[0] as { url: string }).url)
    : undefined;

  return {
    title,
    description,
    openGraph: { title, description, images: image ? [image] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : undefined },
    other: APP_STORE_ID ? { 'apple-itunes-app': `app-id=${APP_STORE_ID}, app-argument=https://parkquest.me/p/${id}` } : {},
  };
}

export default async function SharedPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostFallbackClient id={id} appStoreUrl={APP_STORE_URL} />;
}
