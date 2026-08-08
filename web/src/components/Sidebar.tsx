'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Building2,
  Search,
  Lightbulb,
  FileText,
  Send,
  BarChart3,
  Workflow,
  Settings,
} from 'lucide-react';
import { Logo } from './Logo';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/research', label: 'Research', icon: Search },
  { href: '/opportunities', label: 'Opportunities', icon: Lightbulb },
  { href: '/proposals', label: 'Proposals', icon: FileText },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-obsidian-border bg-obsidian-raised/60 px-4 py-6 backdrop-blur">
      <div className="px-2">
        <Logo />
      </div>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-alveron-gradient/15 text-ink shadow-[inset_0_0_0_1px_rgba(61,126,255,0.25)]'
                  : 'text-ink-soft hover:bg-obsidian-card hover:text-ink'
              )}
            >
              <item.icon
                size={17}
                className={clsx('transition-colors', active ? 'text-electric-bright' : 'text-ink-muted group-hover:text-ink-soft')}
              />
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-alveron-gradient" />}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-lg border border-obsidian-border bg-obsidian-card/60 p-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted">Internal tool</div>
        <div className="mt-1 text-xs leading-relaxed text-ink-soft">
          Every proposal and email requires human approval before it leaves the system.
        </div>
      </div>
    </aside>
  );
}
