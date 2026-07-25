import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
} from '@parkquest/ui-primitives';

export function Open() {
  return (
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="outline">Filters</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 14 }}>Filter parks</strong>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
            Show only national parks you haven&apos;t visited yet.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
