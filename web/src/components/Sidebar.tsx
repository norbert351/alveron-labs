'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Building2,
  Search,
  Radar,
  Lightbulb,
  FileText,
  Send,
  BarChart3,
  Workflow,
  Mail,
  Inbox,
  Activity,
  Settings,
  LogOut,
} from 'lucide-react';
import { Logo } from './Logo';
import { clearSession, getSessionUser } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/research', label: 'Research', icon: Search },
  { href: '/research-runs', label: 'Research Runs', icon: Radar },
  { href: '/opportunities', label: 'Opportunities', icon: Lightbulb },
  { href: '/proposals', label: 'Proposals', icon: FileText },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/email-accounts', label: 'Email Accounts', icon: Mail },
  { href: '/queue', label: 'Outreach Queue', icon: Inbox },
  { href: '/activity', label: 'Email Activity', icon: Activity },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/workflows', label: 'Workflows & Leads', icon: Workflow },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getSessionUser();

  function logout() {
    clearSession();
    router.push('/login');
  }

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-obsidian-border bg-obsidian-raised/40">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
                active ? 'bg-electric/10 text-electric-bright' : 'text-ink-soft hover:bg-obsidian-raised hover:text-ink'
              )}
            >
              <Icon size={15} className={active ? 'text-electric-bright' : 'text-ink-muted'} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-obsidian-border px-5 py-4">
        {user ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-ink">{user.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">{user.role}</div>
            </div>
            <button className="btn-ghost p-1.5" onClick={logout} title="Log out">
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn-primary w-full justify-center text-xs">
            Log in
          </Link>
        )}
        <div className="mt-2 text-[9px] uppercase tracking-widest text-ink-muted">Internal tool</div>
      </div>
    </aside>
  );
}
