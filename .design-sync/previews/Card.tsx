import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
} from '@parkquest/ui-primitives';

export function ParkCard() {
  return (
    <Card style={{ width: 340 }}>
      <CardHeader>
        <CardTitle>Yosemite National Park</CardTitle>
        <CardDescription>Visited 3 times · Last: Jun 2026</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="More">
            ⋯
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0, fontSize: 14 }}>
          El Capitan, Half Dome, and Yosemite Falls — one of the most visited
          parks in California.
        </p>
      </CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button size="sm">Log a visit</Button>
        <Button size="sm" variant="outline">
          View passport
        </Button>
      </CardFooter>
    </Card>
  );
}

export function StatCard() {
  return (
    <Card style={{ width: 220 }}>
      <CardHeader>
        <CardDescription>Parks visited</CardDescription>
        <CardTitle style={{ fontSize: 28 }}>47</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function Minimal() {
  return (
    <Card style={{ width: 280 }}>
      <CardContent>
        <p style={{ margin: 0, fontSize: 14 }}>
          A bare card with just content — no header or footer.
        </p>
      </CardContent>
    </Card>
  );
}
