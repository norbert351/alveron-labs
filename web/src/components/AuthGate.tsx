'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import LoginPage from '@/app/login/page';

/** Redirects unauthenticated users to the login screen. Public pages opt out via `public`. */
export function AuthGate({ children, public: isPublic = false }: { children: ReactNode; public?: boolean }) {
  const [user, setUser] = useState<ReturnType<typeof getSessionUser>>(null);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setUser(getSessionUser());
    setReady(true);
  }, [pathname]);

  if (!ready) return null;
  if (isPublic || pathname === '/login') return <>{children}</>;
  if (!user) return <LoginPage />;
  return <>{children}</>;
}
