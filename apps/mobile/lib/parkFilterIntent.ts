type StatusFilter = 'all' | 'visited' | 'bucketList' | 'notVisited';

let pending: StatusFilter | null = null;

export function setParkFilterIntent(filter: StatusFilter) {
  pending = filter;
}

export function consumeParkFilterIntent(): StatusFilter | null {
  const f = pending;
  pending = null;
  return f;
}
