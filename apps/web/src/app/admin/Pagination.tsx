import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  page, hasMore, basePath, extraParams = '',
}: { page: number; hasMore: boolean; basePath: string; extraParams?: string }) {
  const qs = (p: number) => `${basePath}?page=${p}${extraParams}`;
  return (
    <div className="flex items-center justify-between pt-2">
      <Link
        href={qs(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`flex items-center gap-1 text-sm font-semibold ${page <= 1 ? 'pointer-events-none text-ink-mute/40' : 'text-ink-soft hover:text-primary'}`}
      >
        <ChevronLeft size={15} /> Previous
      </Link>
      <span className="text-xs text-ink-mute">Page {page}</span>
      <Link
        href={qs(page + 1)}
        aria-disabled={!hasMore}
        className={`flex items-center gap-1 text-sm font-semibold ${!hasMore ? 'pointer-events-none text-ink-mute/40' : 'text-ink-soft hover:text-primary'}`}
      >
        Next <ChevronRight size={15} />
      </Link>
    </div>
  );
}
