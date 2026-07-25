## ParkQuest UI primitives — conventions

This DS is the 10 shadcn/ui primitives from ParkQuest's Next.js web app
(`apps/web/src/components/ui/`): `Button`, `Card` (+ `CardHeader`,
`CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`),
`AlertDialog`, `Calendar`, `Dialog`, `Form`, `Input`, `Label`, `Popover`,
`Skeleton`. It is a subset — the app's other 29 components (nav, maps, park
cards, badge UI) are Next.js/Clerk-coupled and were intentionally excluded
from this sync.

**No provider needed.** Nothing in this kit reads React context for
theming — colors and radii come from plain CSS custom properties on
`:root`, so components render correctly with zero wrapper setup. (`Form`
does need a `react-hook-form` `useForm()` instance passed as
`<Form {...form}>` — that's a data dependency, not a design-system
provider.)

**Styling idiom: Tailwind utility classes over CSS custom properties.**
Every component takes a plain `className` (merged via `cn()` /
`tailwind-merge`), never a `variant`-as-CSS-prop system beyond `Button`'s
own `variant`/`size` props. Compose additional Tailwind classes directly —
that's how this DS expects extension. Real token names (verified against
the shipped stylesheet):
- Surfaces/text: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`,
  `text-foreground`, `text-muted-foreground`
- Brand: `bg-primary` / `text-primary-foreground`, `bg-secondary` /
  `text-secondary-foreground`, `bg-accent` / `text-accent-foreground`,
  `bg-destructive`
- Structure: `border-input`, `rounded-md` (10px), `rounded-lg` (14px),
  `rounded-xl` (18px), `rounded-full`
- Raw brand colors as CSS vars (for anything outside Tailwind's utility
  set): `var(--primary)`, `var(--accent)`, `var(--bg)`, `var(--surface)`,
  `var(--ink)`, `var(--radius)`

Never invent new class names or a different token vocabulary — everything
needed is in the list above or the shipped stylesheet.

**Where the truth lives.** `styles.css` (imports the compiled Tailwind
output, `_ds_bundle.css`) has every utility class and `:root` CSS variable
this kit uses — read it before styling anything unfamiliar. Each
`components/general/<Name>/<Name>.prompt.md` documents that component's
props.

**Idiomatic build snippet** — a park card composed the way the app itself
composes them:

```tsx
<Card className="w-[340px]">
  <CardHeader>
    <CardTitle>Yosemite National Park</CardTitle>
    <CardDescription>Visited 3 times · Last: Jun 2026</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-sm">
      El Capitan, Half Dome, and Yosemite Falls.
    </p>
  </CardContent>
  <CardFooter className="gap-2">
    <Button size="sm">Log a visit</Button>
    <Button size="sm" variant="outline">View passport</Button>
  </CardFooter>
</Card>
```

Overlay components (`Dialog`, `AlertDialog`, `Popover`) render via Radix
portals — compose their `Trigger` + `Content` parts together as shown in
each `.prompt.md`, matching the shadcn pattern (`*Header`/`*Footer`/`*Title`
/`*Description` sub-parts, never custom markup in their place).
