import { Skeleton } from '@parkquest/ui-primitives';

export function ListItem() {
  return (
    <div className="flex items-center gap-3" style={{ width: 300 }}>
      <Skeleton className="bg-muted h-10 w-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="bg-muted h-3 w-[70%]" />
        <Skeleton className="bg-muted h-3 w-[40%]" />
      </div>
    </div>
  );
}

export function CardShape() {
  return <Skeleton className="bg-muted h-[120px] w-[220px] rounded-xl" />;
}
