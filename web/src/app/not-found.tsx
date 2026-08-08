import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center animate-fade-up">
      <Logo withWordmark={false} size={44} />
      <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-ink">404</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        This page is not part of the intelligence platform.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Back to overview
      </Link>
    </div>
  );
}
