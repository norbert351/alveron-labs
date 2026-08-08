import type { Metadata } from 'next';
import { Space_Grotesk, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Alveron Labs · Lead Intelligence',
  description: 'Internal lead intelligence dashboard for Alveron Labs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-obsidian text-ink">
        <div className="pointer-events-none fixed inset-0 bg-alveron-glow" aria-hidden />
        <div className="relative flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden px-6 py-8 lg:px-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
