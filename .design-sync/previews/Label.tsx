import { Label, Input } from '@parkquest/ui-primitives';

export function WithInput() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 260 }}>
      <Label htmlFor="ds-park-name">Park name</Label>
      <Input id="ds-park-name" placeholder="Zion National Park" />
    </div>
  );
}

export function Standalone() {
  return <Label>Visited date</Label>;
}
