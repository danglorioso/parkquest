import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { ImageIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { posts, userProfiles, parks } from '@/lib/db/schema';
import { Pagination } from '../Pagination';
import { Avatar } from '@/components/PostCard';
import { parkGradient } from '@/lib/parkGradient';

const PAGE_SIZE = 30;

export default async function AdminPostsPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: posts.id,
      caption: posts.caption,
      created_at: posts.created_at,
      photos: posts.photos,
      park_code: posts.park_code,
      username: userProfiles.username,
      display_name: userProfiles.display_name,
      avatar_url: userProfiles.avatar_url,
      park_name: parks.name,
    })
    .from(posts)
    .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
    .leftJoin(parks, eq(posts.park_code, parks.park_code))
    .orderBy(desc(posts.created_at))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Posts</h1>
        <p className="mt-1 text-sm text-ink-mute">Most recent first.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map(p => {
          const cover = p.photos?.[0]?.url ?? null;
          return (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              target="_blank"
              className="group relative block aspect-square overflow-hidden rounded-lg border border-hairline bg-surface-alt"
            >
              {cover ? (
                <img src={cover} alt={p.caption ?? ''} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center" style={{ background: parkGradient(p.park_code ?? 'xx') }}>
                  {p.caption ? (
                    <span className="line-clamp-5 text-xs font-semibold text-white/90">{p.caption}</span>
                  ) : (
                    <ImageIcon size={22} className="text-white/70" />
                  )}
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-2 pt-6">
                <div className="flex items-center gap-1.5">
                  <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={18} />
                  <span className="truncate text-[11px] font-bold text-white">
                    {p.username ? `@${p.username}` : p.display_name ?? '—'}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-white/75">
                  <span className="truncate">{p.park_name ?? '—'}</span>
                  <span className="shrink-0">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span>
                </div>
              </div>

              {cover && p.caption && (
                <div className="absolute inset-0 flex items-end bg-black/0 p-2.5 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                  <span className="line-clamp-4 text-[11px] font-medium text-white">{p.caption}</span>
                </div>
              )}
            </Link>
          );
        })}
        {items.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-ink-mute">No posts found.</div>
        )}
      </div>

      <Pagination page={page} hasMore={hasMore} basePath="/admin/posts" />
    </div>
  );
}
