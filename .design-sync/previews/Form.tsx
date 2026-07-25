import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  Input,
  Button,
} from '@parkquest/ui-primitives';

type Values = { parkName: string; notes: string };

export function VisitForm() {
  const form = useForm<Values>({
    defaultValues: { parkName: 'Zion National Park', notes: '' },
  });
  return (
    <Form {...form}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 320 }}>
        <FormField
          control={form.control}
          name="parkName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Park name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>The park you visited.</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Input placeholder="Optional trip notes" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Save visit</Button>
      </div>
    </Form>
  );
}

export function WithError() {
  const form = useForm<Values>({
    defaultValues: { parkName: '', notes: '' },
  });
  useEffect(() => {
    form.setError('parkName', { message: 'Park name is required.' });
  }, [form]);
  return (
    <Form {...form}>
      <div style={{ width: 320 }}>
        <FormField
          control={form.control}
          name="parkName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Park name</FormLabel>
              <FormControl>
                <Input {...field} aria-invalid />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </Form>
  );
}
