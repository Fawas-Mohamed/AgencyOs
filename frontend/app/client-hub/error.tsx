'use client';
import { Button } from '@/components/ui/primitives';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="panel p-6 space-y-3">
      <h1>Unable to display this workspace</h1>
      <p>Please retry or return to the client list.</p>
      <Button onClick={reset}>Retry</Button>
    </div>
  );
}
