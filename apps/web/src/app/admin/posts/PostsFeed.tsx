'use client';

import { useState } from 'react';
import { PostCard, type FeedPost } from '@/components/PostCard';

export function PostsFeed({ initialPosts }: { initialPosts: FeedPost[] }) {
  const [posts, setPosts] = useState(initialPosts);

  const handleLike = async (postId: number, currentlyLiked: boolean) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, liked_by_me: !currentlyLiked, like_count: p.like_count + (currentlyLiked ? -1 : 1) }
        : p
    ));
    try {
      if (currentlyLiked) {
        await fetch(`/api/likes?postId=${postId}`, { method: 'DELETE' });
      } else {
        await fetch('/api/likes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId }),
        });
      }
    } catch {
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, liked_by_me: currentlyLiked, like_count: p.like_count + (currentlyLiked ? 1 : -1) }
          : p
      ));
    }
  };

  const handleDelete = (postId: number) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  if (posts.length === 0) {
    return <div className="py-16 text-center text-sm text-ink-mute">No posts found.</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4">
      {posts.map(post => (
        <PostCard key={post.id} post={post} onLike={handleLike} onDelete={handleDelete} canDelete />
      ))}
    </div>
  );
}
