"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserRound, UserCheck, Clock } from "lucide-react";
import Link from "next/link";

interface FriendUser {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  friends_since?: string | null;
}

interface PendingUser {
  friendship_id: number;
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_at?: string | null;
}

interface FriendListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  isOwnProfile: boolean;
}

type Tab = "friends" | "requests";

export default function FriendListModal({
  open,
  onOpenChange,
  targetUserId,
  isOwnProfile,
}: FriendListModalProps) {
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<FriendUser[] | null>(null);
  const [pending, setPending] = useState<PendingUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [respondedTo, setRespondedTo] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setTab("friends");
      setFriends(null);
      setPending(null);
      setRespondedTo(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tab === "friends" && friends !== null) return;
    if (tab === "requests" && pending !== null) return;

    setLoading(true);
    const url = tab === "friends"
      ? `/api/friends?userId=${targetUserId}&type=friends`
      : `/api/friends?userId=${targetUserId}&type=pending_incoming`;

    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((data) => {
        if (tab === "friends") setFriends(data);
        else setPending(data);
      })
      .catch(() => {
        if (tab === "friends") setFriends([]);
        else setPending([]);
      })
      .finally(() => setLoading(false));
  }, [open, tab, targetUserId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRespond = async (friendshipId: number, action: 'accept' | 'reject') => {
    const res = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId, action }),
    });
    if (res.ok) {
      setRespondedTo(prev => new Set([...prev, friendshipId]));
      if (action === 'accept') {
        // Refresh the friends list so the new friend shows up
        setFriends(null);
      }
    }
  };

  const handleUnfriend = async (userId: string) => {
    const res = await fetch(`/api/friends?userId=${userId}`, { method: 'DELETE' });
    if (res.ok) {
      setFriends(prev => prev ? prev.filter(f => f.clerk_user_id !== userId) : prev);
    }
  };

  const current = tab === "friends" ? friends : pending;
  const pendingCount = pending?.filter(p => !respondedTo.has(p.friendship_id)).length ?? 0;

  const tabs: Tab[] = isOwnProfile ? ["friends", "requests"] : ["friends"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="sr-only">Friends</DialogTitle>
          <div className="flex border-b border-gray-200">
            {tabs.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5 ${
                  tab === t
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t === "requests" ? "Requests" : "Friends"}
                {t === "requests" && pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[420px] px-2 py-2">
          {loading || current === null ? (
            <div className="space-y-1 px-3 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-28 rounded" />
                    <Skeleton className="h-2.5 w-20 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "friends" ? (
            (friends ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No friends yet</p>
            ) : (
              (friends ?? []).map(u => (
                <div key={u.clerk_user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <Link href={`/profile/${u.username}`} onClick={() => onOpenChange(false)} className="shrink-0">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.username} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <UserRound className="w-5 h-5 text-emerald-600" />
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/profile/${u.username}`} onClick={() => onOpenChange(false)} className="block">
                      {u.display_name && (
                        <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{u.display_name}</p>
                      )}
                      <p className={`truncate leading-tight ${u.display_name ? "text-xs text-gray-400" : "text-sm font-semibold text-gray-900"}`}>
                        @{u.username}
                      </p>
                    </Link>
                  </div>
                  {isOwnProfile && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnfriend(u.clerk_user_id)}
                      className="shrink-0 h-8 text-xs px-3"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))
            )
          ) : (
            // Pending requests tab (own profile only)
            (pending ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No pending requests</p>
            ) : (
              (pending ?? []).map(u => {
                const responded = respondedTo.has(u.friendship_id);
                return (
                  <div key={u.friendship_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <Link href={`/profile/${u.username}`} onClick={() => onOpenChange(false)} className="shrink-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.username} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                          <UserRound className="w-5 h-5 text-emerald-600" />
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/profile/${u.username}`} onClick={() => onOpenChange(false)} className="block">
                        {u.display_name && (
                          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{u.display_name}</p>
                        )}
                        <p className={`truncate leading-tight ${u.display_name ? "text-xs text-gray-400" : "text-sm font-semibold text-gray-900"}`}>
                          @{u.username}
                        </p>
                      </Link>
                    </div>
                    {responded ? (
                      <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> Done
                      </span>
                    ) : (
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleRespond(u.friendship_id, 'accept')}
                          className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRespond(u.friendship_id, 'reject')}
                          className="h-8 text-xs px-3"
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Outgoing requests note */}
        {tab === "friends" && isOwnProfile && (
          <div style={{ borderTop: "0.5px solid var(--hairline-soft)", padding: "8px 16px" }}>
            <p className="text-xs text-gray-400 text-center">
              Switch to Requests to review incoming friend requests
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
