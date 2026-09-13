import { useEffect, useState } from 'react';
import { PassportExpandView, type PassportExpandRequest } from '@/components/PassportExpandView';

export type { PassportExpandRequest };

// Mounted ONCE at the app root (see _layout.tsx, same spot as
// ImageLightboxHost) — the expand overlay has to paint above the floating
// tab bar, which a screen-local absolute View can't reach (FloatingTabBar is
// a later sibling at the Tab.Navigator level, so it always draws on top of
// anything inside an individual tab screen's own subtree). The profile
// screen calls openPassportExpand() imperatively instead of rendering the
// overlay inline, and hands over an already-measured origin rect plus
// whatever profile data it has loaded so the cover appears instantly with
// no refetch/loading flash — only the national-park list is fetched fresh.
let openFn: ((req: PassportExpandRequest) => void) | null = null;

export function openPassportExpand(req: PassportExpandRequest) {
  openFn?.(req);
}

export function PassportExpandHost() {
  const [request, setRequest] = useState<PassportExpandRequest | null>(null);

  useEffect(() => {
    openFn = setRequest;
    return () => { openFn = null; };
  }, []);

  if (!request) return null;

  // PassportExpandView only calls onClose once its own shrink-back-to-card
  // animation has finished, so unmounting here never cuts the animation short.
  return <PassportExpandView {...request} onClose={() => setRequest(null)} />;
}
