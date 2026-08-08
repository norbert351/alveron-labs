'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center animate-fade-up">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">{error.message}</p>
      <button className="btn-primary mt-6" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
