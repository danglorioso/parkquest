import { Search, Trash2, MapPin } from 'lucide-react';
import { Button } from '@parkquest/ui-primitives';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 340 }}>
      <Button variant="default">Log a visit</Button>
      <Button variant="secondary">Save for later</Button>
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive">Remove park</Button>
      <Button variant="ghost">Skip</Button>
      <Button variant="link">View details</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Search">
        <Search />
      </Button>
    </div>
  );
}

export function WithIcon() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Button>
        <MapPin />
        Add to bucket list
      </Button>
      <Button variant="destructive">
        <Trash2 />
        Delete
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Button disabled>Saving…</Button>
      <Button variant="outline" disabled>
        Unavailable
      </Button>
    </div>
  );
}
