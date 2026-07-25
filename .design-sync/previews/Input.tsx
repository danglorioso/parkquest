import { Input } from '@parkquest/ui-primitives';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
      <Input placeholder="Search parks…" />
      <Input type="email" placeholder="you@example.com" />
      <Input type="password" defaultValue="hunt3rsecret" />
      <Input disabled placeholder="Unavailable" />
    </div>
  );
}
