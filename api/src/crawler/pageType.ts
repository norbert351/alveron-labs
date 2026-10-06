/** Page-type classification from URL path + title (spec sections 7, 9). */

export type PageType =
  | 'homepage'
  | 'about'
  | 'services'
  | 'products'
  | 'pricing'
  | 'contact'
  | 'booking'
  | 'checkout'
  | 'blog'
  | 'faq'
  | 'careers'
  | 'locations'
  | 'menu'
  | 'other';

const PATTERNS: { type: PageType; patterns: string[] }[] = [
  { type: 'about', patterns: ['about', 'our-story', 'who-we-are', 'company', 'team', 'story'] },
  { type: 'services', patterns: ['service', 'solutions', 'what-we-do', 'treatments', 'capabilities'] },
  { type: 'products', patterns: ['product', 'shop', 'store', 'catalog', 'catalogue', 'collection', 'item'] },
  { type: 'pricing', patterns: ['pricing', 'price', 'plans', 'packages', 'rates', 'cost'] },
  { type: 'contact', patterns: ['contact', 'get-in-touch', 'reach-us', 'enquir', 'inquire', 'enquire'] },
  { type: 'booking', patterns: ['book', 'appointment', 'reserv', 'schedule', 'consultation'] },
  { type: 'checkout', patterns: ['checkout', 'cart', 'basket', 'payment', 'order'] },
  { type: 'blog', patterns: ['blog', 'news', 'article', 'insight', 'press', 'updates'] },
  { type: 'faq', patterns: ['faq', 'questions', 'help', 'support'] },
  { type: 'careers', patterns: ['career', 'job', 'vacanc', 'hiring', 'work-with-us'] },
  { type: 'locations', patterns: ['location', 'branch', 'find-us', 'store-locator', 'our-offices'] },
  { type: 'menu', patterns: ['menu', 'food', 'dishes', 'eat'] },
];

export function classifyPage(url: string, title = ''): PageType {
  let path = '';
  try {
    const u = new URL(url);
    path = (u.pathname + ' ' + u.search).toLowerCase();
    if (u.pathname === '/' || u.pathname === '') {
      // homepage by path, but a title hint can still reclassify (rare).
      if (!title) return 'homepage';
      path = ' ' + path;
    }
  } catch {
    path = url.toLowerCase();
  }
  const t = (title || '').toLowerCase();
  for (const { type, patterns } of PATTERNS) {
    if (patterns.some((p) => path.includes(p))) return type;
  }
  for (const { type, patterns } of PATTERNS) {
    if (patterns.some((p) => t.includes(p))) return type;
  }
  try {
    const u = new URL(url);
    if (u.pathname === '/' || u.pathname === '') return 'homepage';
  } catch {
    /* ignore */
  }
  return 'other';
}
