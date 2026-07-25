import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  Button,
} from '@parkquest/ui-primitives';

export function Open() {
  return (
    <Dialog open>
      <DialogTrigger asChild>
        <Button variant="outline">Log a visit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log your visit</DialogTitle>
          <DialogDescription>
            Add the date and a quick note about your trip to Zion National
            Park.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save visit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
