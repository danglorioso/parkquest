"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { Search, X, UserPlus, Clock, Users } from "lucide-react";

interface UserResult {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FindFriendsDialog({ open, onOpenChange }: Props) {
  const { user } = useUser();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Map of clerk_user_id → "friend" | "pending" | "sent" (local after action)
  const [statusMap, setStatusMap] = useState<Record<string, "friend" | "pending">>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Load existing friend/pending state when dialog opens
  useEffect(() => {
    if (!open || !user) return;
    setQuery("");
    setResults([]);

    const userId = user.id;
    Promise.all([
      fetch(`/api/friends?userId=${userId}&type=friends`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/friends?userId=${userId}&type=pending_outgoing`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([friends, pending]) => {
      const map: Record<string, "friend" | "pending"> = {};
      for (const f of friends as UserResult[]) map[f.clerk_user_id] = "friend";
      for (const p of pending as UserResult[]) map[p.clerk_user_id] = "pending";
      setStatusMap(map);
    }).catch(() => {});

    setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, user]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setSearching(false); return; }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/users?search=${encodeURIComponent(query.trim())}&limit=12`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: UserResult[]) => { setResults(data); setSearching(false); })
        .catch(() => setSearching(false));
    }, 280);
  }, [query]);

  async function sendRequest(target: UserResult) {
    setStatusMap((prev) => ({ ...prev, [target.clerk_user_id]: "pending" }));
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: target.clerk_user_id }),
    });
    if (!res.ok) {
      setStatusMap((prev) => { const next = { ...prev }; delete next[target.clerk_user_id]; return next; });
    }
  }

  if (!open) return null;

  const content = (
    <div
      onClick={() => onOpenChange(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.48)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440,
          background: "var(--bg)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
          animation: "pqFF 180ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        <style>{`@keyframes pqFF { from { opacity:0; transform:translateY(8px) scale(0.98) } to { opacity:1; transform:none } }`}</style>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          borderBottom: "0.5px solid var(--hairline-soft)",
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>Find friends</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.2px", color: "var(--ink-mute)", marginTop: 2 }}>
              SEARCH BY NAME OR USERNAME
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "var(--surface-alt)", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--ink-soft)",
            }}
          >
            <X style={{ width: 14, height: 14 }} strokeWidth={2.2} />
          </button>
        </div>

        {/* Search input */}
        <div style={{ padding: "14px 20px 10px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 9,
            background: "var(--surface)", border: "0.5px solid var(--hairline)",
            borderRadius: 10, padding: "9px 12px",
          }}>
            <Search style={{ width: 14, height: 14, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              style={{
                flex: 1, border: "none", background: "transparent",
                fontSize: 13.5, color: "var(--ink)", outline: "none",
                fontFamily: "inherit",
              }}
            />
            {searching && (
              <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--hairline)", borderTopColor: "var(--primary)", animation: "pqSpin 600ms linear infinite", flexShrink: 0 }} />
            )}
            <style>{`@keyframes pqSpin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>

        {/* Results */}
        <div style={{ minHeight: 80, maxHeight: 360, overflowY: "auto", padding: "0 12px 16px" }}>
          {!query.trim() ? (
            <div style={{ padding: "28px 8px", textAlign: "center" }}>
              <Users style={{ width: 28, height: 28, color: "var(--ink-mute)", margin: "0 auto 10px" }} strokeWidth={1.5} />
              <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>Type a name or username to search</div>
            </div>
          ) : results.length === 0 && !searching ? (
            <div style={{ padding: "28px 8px", textAlign: "center", fontSize: 13, color: "var(--ink-mute)" }}>
              No users found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((u) => {
              const name = u.display_name || u.username;
              const initials = name.slice(0, 2).toUpperCase();
              const status = statusMap[u.clerk_user_id];

              return (
                <div
                  key={u.clerk_user_id}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "9px 8px", borderRadius: 10,
                  }}
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={name}
                      style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      fontSize: 11, fontWeight: 700, color: "var(--ink-mute)", fontFamily: "var(--font-mono)",
                    }}>
                      {initials}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>@{u.username}</div>
                  </div>

                  {status === "friend" ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 11.5, fontWeight: 600, color: "var(--primary)",
                      padding: "5px 11px", borderRadius: 7,
                      background: "rgba(31,61,46,0.07)",
                    }}>
                      <Users style={{ width: 11, height: 11 }} strokeWidth={2.5} />
                      Friends
                    </div>
                  ) : status === "pending" ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 11.5, fontWeight: 600, color: "var(--ink-mute)",
                      padding: "5px 11px", borderRadius: 7,
                      background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
                    }}>
                      <Clock style={{ width: 11, height: 11 }} strokeWidth={2.5} />
                      Pending
                    </div>
                  ) : (
                    <button
                      onClick={() => sendRequest(u)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: "var(--primary)", color: "#fff",
                        border: "none", borderRadius: 7, cursor: "pointer",
                        fontSize: 12, fontWeight: 650, padding: "5px 12px",
                      }}
                    >
                      <UserPlus style={{ width: 12, height: 12 }} strokeWidth={2.5} />
                      Add
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
