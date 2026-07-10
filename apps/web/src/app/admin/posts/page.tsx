import { eq, desc, sql } from 'drizzle-orm';
import { currentUser } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { posts, userProfiles, parks, visits } from '@/lib/db/schema';
import { Pagination } from '../Pagination';
import { PostsFeed } from './PostsFeed';
import type { FeedPost } from '@/components/PostCard';

const PAGE_SIZE = 10;

export default async function AdminPostsPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const admin = await currentUser();

  const rows = await db
    .select({
      id: posts.id,
      caption: posts.caption,
      photos: posts.photos,
      park_code: posts.park_code,
      visit_id: posts.visit_id,
      quoted_post_id: posts.quoted_post_id,
      badge_id: posts.badge_id,
      created_at: posts.created_at,
      clerk_user_id: posts.clerk_user_id,
      park_name: parks.name,
      username: userProfiles.username,
      display_name: userProfiles.display_name,
      avatar_url: userProfiles.avatar_url,
      like_count: sql<number>`(SELECT COUNT(*)::int FROM likes WHERE likes.post_id = ${posts.id})`,
      comment_count: sql<number>`(SELECT COUNT(*)::int FROM comments WHERE comments.post_id = ${posts.id})`,
      liked_by_me: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${admin?.id ?? ''})`,
      visit_date: visits.visited_date,
      visit_rating: visits.rating,
      visit_activities: visits.activities,
      visit_weather: visits.weather_conditions,
      visit_crowd: visits.crowd,
      visit_difficulty: visits.difficulty,
      visit_companion_count: sql<number>`COALESCE(jsonb_array_length(${visits.companions}), 0)`,
      visit_companion_names: sql<Array<{ username: string; display_name: string | null; avatar_url: string | null }> | null>`(SELECT json_agg(json_build_object('username', up.username, 'display_name', up.display_name, 'avatar_url', up.avatar_url)) FROM user_profiles up WHERE up.clerk_user_id = ANY(SELECT jsonb_array_elements_text(${visits.companions})))`,
      visit_highlight: visits.highlight,
    })
    .from(posts)
    .leftJoin(parks, eq(posts.park_code, parks.park_code))
    .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
    .leftJoin(visits, eq(posts.visit_id, visits.id))
    .orderBy(desc(posts.created_at))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  const items: FeedPost[] = rows.slice(0, PAGE_SIZE).map(p => ({
    ...p,
    photos: Array.isArray(p.photos) ? p.photos.map(ph => ph.url) : null,
    created_at: p.created_at ? p.created_at.toISOString() : new Date().toISOString(),
    visit_date: p.visit_date ? p.visit_date.toISOString() : null,
    quoted_post_id: p.quoted_post_id,
    quoted_post: null,
    is_friend_post: false,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Posts</h1>
        <p className="mt-1 text-sm text-ink-mute">Most recent first.</p>
      </div>

      <PostsFeed initialPosts={items} />

      <Pagination page={page} hasMore={hasMore} basePath="/admin/posts" />
    </div>
  );
}
