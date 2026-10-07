// Strips identity + personal fields from a post before it's sent to a
// signed-out caller — not just hidden in the UI, actually left out of the
// response, so a crawler or scraper hitting the API directly never sees a
// real name, avatar, or date either. Caption/highlight are teased (cut
// short with an ellipsis), not hidden outright, so the content still reads
// as worth signing up for.
const TEASE_CHARS = 140;

function tease(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  if (text.length <= TEASE_CHARS) return text;
  const cut = text.slice(0, TEASE_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : TEASE_CHARS)}…`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function redactAnonPost<T extends Record<string, any>>(post: T): T {
  return {
    ...post,
    clerk_user_id: "",
    username: null,
    display_name: null,
    avatar_url: null,
    created_at: null,
    visit_date: null,
    caption: tease(post.caption),
    visit_highlight: tease(post.visit_highlight),
    visit_notes: null,
    visit_companion_names: null,
    // One photo is enough of a teaser — the rest stay behind sign-up.
    photos: Array.isArray(post.photos) ? post.photos.slice(0, 1) : post.photos,
  };
}
