import { useState } from 'react';
import { Calendar } from '@parkquest/ui-primitives';

export function SingleDate() {
  const [date, setDate] = useState(new Date(2026, 5, 15));
  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      defaultMonth={date}
    />
  );
}
