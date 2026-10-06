import * as cheerio from 'cheerio';

/**
 * Deterministic DOM fact extraction (spec section 9 + section 27).
 *
 * Everything here is observed programmatically from the real page — never
 * inferred by an LLM. These facts form the evidence the AI reasons over.
 */

export interface FormFact {
  action: string | null;
  method: string | null;
  inputCount: number;
  hasEmailField: boolean;
  hasPhoneField: boolean;
  hasTextarea: boolean;
  hasFileUpload: boolean;
  hasSubmit: boolean;
  selectCount: number;
}

export interface DomFacts {
  hasViewport: boolean;
  hasCanonical: boolean;
  hasHttps: boolean;
  metaDescription: string;
  title: string;
  h1s: string[];
  h2s: string[];
  ogTitle: string;
  jsonLdTypes: string[];
  structuredDataBlocks: number;
  formCount: number;
  forms: FormFact[];
  iframeCount: number;
  iframeHosts: string[];
  imgCount: number;
  imgMissingAlt: number;
  scriptCount: number;
  inlineScriptCount: number;
  externalScriptHosts: string[];
  stylesheetCount: number;
  linkRels: string[];
  telLinks: number;
  mailtoLinks: number;
  socialLinks: string[];
  navLinkCount: number;
  ctaTexts: string[];
  hasCookieBanner: boolean;
  checkoutIndicators: string[];
  bookingIndicators: string[];
  paymentIndicators: string[];
  analyticsIndicators: string[];
  chatIndicators: string[];
  cmsIndicators: string[];
  ecommerceIndicators: string[];
  bookingProviders: string[];
  crmIndicators: string[];
  textLength: number;
}

const CMS: [RegExp, string][] = [
  [/wp-content|wp-includes|wp-json/i, 'WordPress'],
  [/cdn\.shopify\.com|shopify\.theme/i, 'Shopify'],
  [/static\.wixstatic\.com|wix\.com/i, 'Wix'],
  [/static1\.squarespace\.com|squarespace/i, 'Squarespace'],
  [/webflow\.(js|com)/i, 'Webflow'],
  [/framer\.com|framerusercontent/i, 'Framer'],
  [/cdn\.webflow/i, 'Webflow'],
  [/joomla/i, 'Joomla'],
  [/drupal/i, 'Drupal'],
  [/wixstatic/i, 'Wix'],
  [/\.myshopify\.com/i, 'Shopify'],
];

const ECOM: [RegExp, string][] = [
  [/woocommerce/i, 'WooCommerce'],
  [/shopify/i, 'Shopify'],
  [/magento/i, 'Magento'],
  [/bigcommerce/i, 'BigCommerce'],
  [/prestashop/i, 'PrestaShop'],
  [/opencart/i, 'OpenCart'],
  [/add_to_cart|add-to-cart|data-product-id/i, 'Cart UI'],
  [/snipcart|ecwid/i, 'Headless cart'],
];

const PAYMENT: [RegExp, string][] = [
  [/js\.stripe\.com|stripe\.com\/v3/i, 'Stripe'],
  [/paypal\.com|paypalobjects/i, 'PayPal'],
  [/squareup\.com|square\.com/i, 'Square'],
  [/checkout\.razorpay|razorpay/i, 'Razorpay'],
  [/paystack\.co|paystack\.com/i, 'Paystack'],
  [/flutterwave/i, 'Flutterwave'],
  [/braintree|paypal\.com\/sdk/i, 'Braintree'],
  [/klarna/i, 'Klarna'],
  [/adyen/i, 'Adyen'],
  [/mollie/i, 'Mollie'],
];

const ANALYTICS: [RegExp, string][] = [
  [/googletagmanager\.com|gtag\(|google-analytics\.com|ga\(/i, 'Google Analytics/GTM'],
  [/connect\.facebook\.net|fbq\(/i, 'Meta Pixel'],
  [/static\.hotjar\.com|hotjar/i, 'Hotjar'],
  [/clarity\.ms/i, 'Microsoft Clarity'],
  [/matomo|piwik/i, 'Matomo'],
  [/plausible\.io/i, 'Plausible'],
  [/segment\.(com|io)/i, 'Segment'],
  [/posthog/i, 'PostHog'],
];

const CHAT: [RegExp, string][] = [
  [/widget\.intercom\.io|intercom/i, 'Intercom'],
  [/tawk\.to/i, 'Tawk.to'],
  [/static\.zdassets\.com|zendesk/i, 'Zendesk'],
  [/crisp\.chat|client\.crisp/i, 'Crisp'],
  [/drift\.com|driftt/i, 'Drift'],
  [/livechatinc|livechat\.com/i, 'LiveChat'],
  [/tidio/i, 'Tidio'],
  [/hubspot.*conversations|hs-scripts/i, 'HubSpot'],
  [/whatsapp|wa\.me/i, 'WhatsApp'],
  [/messenger|m\.me/i, 'Messenger'],
];

const BOOKING: [RegExp, string][] = [
  [/calendly/i, 'Calendly'],
  [/acuityscheduling/i, 'Acuity'],
  [/squareup\.com\/appointments|square\.site/i, 'Square Appointments'],
  [/booksy/i, 'Booksy'],
  [/setmore/i, 'Setmore'],
  [/mindbodyonline|mindbody/i, 'Mindbody'],
  [/opentable/i, 'OpenTable'],
  [/resy\.com/i, 'Resy'],
  [/sevenrooms/i, 'SevenRooms'],
  [/booking\.com\/widget/i, 'Booking.com'],
  [/tock\.to/i, 'Tock'],
  [/simplybook/i, 'SimplyBook'],
  [/zocdoc/i, 'Zocdoc'],
  [/doctolib/i, 'Doctolib'],
  [/housecallpro/i, 'Housecall Pro'],
  [/servicetitan/i, 'ServiceTitan'],
  [/appointment/i, 'Appointment link'],
  [/book\s*(now|online|an?\s+appointment)/i, 'Book online CTA'],
];

const CRM: [RegExp, string][] = [
  [/hs-scripts\.com|hubspot/i, 'HubSpot'],
  [/salesforce|force\.com/i, 'Salesforce'],
  [/marketo/i, 'Marketo'],
  [/mailchimp|list-manage\.com/i, 'Mailchimp'],
  [/klaviyo/i, 'Klaviyo'],
  [/pipedrive/i, 'Pipedrive'],
  [/zoho\.com\/crm/i, 'Zoho CRM'],
  [/activecampaign/i, 'ActiveCampaign'],
];

const BOOKING_HOSTS = ['calendly.com', 'acuityscheduling.com', 'booksy.com', 'setmore.com', 'opentable.com', 'resy.com', 'tock.to', 'mindbodyonline.com', 'simplybook.me', 'zocdoc.com', 'doctolib.com', 'square.site', 'squareup.com', 'sevenrooms.com'];
const SOCIAL_HOSTS = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com', 'wa.me', 't.me', 'yelp.com', 'threads.net'];

function matchAll(haystack: string, table: [RegExp, string][]): string[] {
  const out = new Set<string>();
  for (const [re, name] of table) if (re.test(haystack)) out.add(name);
  return [...out];
}

export function extractDomFacts(html: string, pageUrl: string): DomFacts {
  const $ = cheerio.load(html);
  const host = (() => {
    try {
      return new URL(pageUrl).hostname;
    } catch {
      return '';
    }
  })();

  const title = $('title').first().text().trim().slice(0, 300);
  const metaDescription = ($('meta[name="description"]').attr('content') || '').trim().slice(0, 500);
  const hasViewport = $('meta[name="viewport"]').length > 0;
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  const ogTitle = ($('meta[property="og:title"]').attr('content') || '').trim().slice(0, 300);

  const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter((t) => t).slice(0, 10);
  const h2s = $('h2').map((_, el) => $(el).text().trim()).get().filter((t) => t).slice(0, 20);

  // JSON-LD / structured data
  const jsonLdTypes: string[] = [];
  let structuredDataBlocks = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    structuredDataBlocks++;
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const it of items) {
        const t = it?.['@type'];
        if (typeof t === 'string') jsonLdTypes.push(t);
        else if (Array.isArray(t)) jsonLdTypes.push(...t.map(String));
        if (it?.['@graph'] && Array.isArray(it['@graph'])) {
          for (const g of it['@graph']) if (typeof g?.['@type'] === 'string') jsonLdTypes.push(g['@type']);
        }
      }
    } catch {
      /* malformed JSON-LD is itself a signal, handled by the caller */
    }
  });

  // Forms
  const forms: FormFact[] = [];
  $('form').each((_, el) => {
    const $f = $(el);
    const inputs = $f.find('input');
    const types = inputs.map((__, i) => ($(i).attr('type') || 'text').toLowerCase()).get();
    forms.push({
      action: $f.attr('action') || null,
      method: ($f.attr('method') || 'get').toLowerCase(),
      inputCount: inputs.length,
      hasEmailField: types.includes('email') || inputs.toArray().some((i) => /e-?mail/i.test($(i).attr('name') || '')),
      hasPhoneField: types.includes('tel') || inputs.toArray().some((i) => /phone|tel/i.test($(i).attr('name') || '')),
      hasTextarea: $f.find('textarea').length > 0,
      hasFileUpload: types.includes('file'),
      hasSubmit: $f.find('[type="submit"], button').length > 0,
      selectCount: $f.find('select').length,
    });
  });

  const iframeHosts = $('iframe')
    .map((_, el) => {
      const src = $(el).attr('src') || '';
      try {
        return new URL(src, pageUrl).hostname;
      } catch {
        return '';
      }
    })
    .get()
    .filter((h) => h);

  const imgs = $('img');
  const imgCount = imgs.length;
  const imgMissingAlt = imgs.toArray().filter((el) => !$(el).attr('alt')?.trim()).length;

  const scriptSrcs = $('script[src]').map((_, el) => $(el).attr('src') || '').get();
  const externalScriptHosts = [...new Set(
    scriptSrcs
      .map((s) => {
        try {
          const h = new URL(s, pageUrl).hostname;
          return h && h !== host ? h : '';
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  )];
  const inlineScriptCount = $('script:not([src])').length;

  const linkRels = [...new Set($('link[rel]').map((_, el) => ($(el).attr('rel') || '').toLowerCase()).get().filter(Boolean))];

  const allLinks = $('a[href]');
  const telLinks = allLinks.toArray().filter((el) => ($(el).attr('href') || '').startsWith('tel:')).length;
  const mailtoLinks = allLinks.toArray().filter((el) => ($(el).attr('href') || '').startsWith('mailto:')).length;

  const hrefs = allLinks.map((_, el) => $(el).attr('href') || '').get();
  const socialLinks = [...new Set(
    hrefs
      .map((h) => {
        try {
          const u = new URL(h, pageUrl);
          return SOCIAL_HOSTS.find((s) => u.hostname === s || u.hostname.endsWith('.' + s)) || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  )];

  const bookingProviderHosts = [...new Set(
    [...hrefs, ...scriptSrcs, ...iframeHosts.map((h) => 'https://' + h)]
      .map((h) => {
        try {
          const u = new URL(h, pageUrl);
          return BOOKING_HOSTS.find((b) => u.hostname === b || u.hostname.endsWith('.' + b)) || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  )];

  const navLinkCount = $('nav a, header a').length;

  const ctaTexts: string[] = [];
  $('a, button').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return;
    if (/book|appoint|reserve|contact|buy|shop now|order|get a quote|request|sign ?up|subscribe|call now|enquir|get started|schedule|start (now|free)|free (trial|quote|consultation)|download/i.test(t)) {
      ctaTexts.push(t.toLowerCase());
    }
  });

  const wholeHtml = html;
  const fullText = $('body').text().replace(/\s+/g, ' ').trim();

  const hasCookieBanner = /cookie[- ]?(banner|consent|notice)|gdpr|we use cookies|accept cookies/i.test(wholeHtml);

  return {
    hasViewport,
    hasCanonical,
    hasHttps: pageUrl.startsWith('https://'),
    metaDescription,
    title,
    h1s,
    h2s,
    ogTitle,
    jsonLdTypes: [...new Set(jsonLdTypes)].slice(0, 30),
    structuredDataBlocks,
    formCount: forms.length,
    forms: forms.slice(0, 8),
    iframeCount: iframeHosts.length,
    iframeHosts: [...new Set(iframeHosts)].slice(0, 20),
    imgCount,
    imgMissingAlt,
    scriptCount: scriptSrcs.length,
    inlineScriptCount,
    externalScriptHosts: externalScriptHosts.slice(0, 40),
    stylesheetCount: $('link[rel="stylesheet"]').length,
    linkRels,
    telLinks,
    mailtoLinks,
    socialLinks: socialLinks.slice(0, 15),
    navLinkCount,
    ctaTexts: [...new Set(ctaTexts)].slice(0, 25),
    hasCookieBanner,
    checkoutIndicators: matchAll(wholeHtml, [[/checkout/i, 'checkout'], [/add to cart|add-to-cart/i, 'cart'], [/shopping cart|cart-drawer/i, 'cart widget'], [/\/cart\b/i, 'cart link']]),
    bookingIndicators: [...new Set([...matchAll(wholeHtml, BOOKING), ...bookingProviderHosts.map((b) => `booking:${b}`)])],
    paymentIndicators: matchAll(wholeHtml, PAYMENT),
    analyticsIndicators: matchAll(wholeHtml, ANALYTICS),
    chatIndicators: matchAll(wholeHtml, CHAT),
    cmsIndicators: matchAll(wholeHtml, CMS),
    ecommerceIndicators: matchAll(wholeHtml, ECOM),
    bookingProviders: bookingProviderHosts,
    crmIndicators: matchAll(wholeHtml, CRM),
    textLength: fullText.length,
  };
}

export function extractText(html: string, maxChars = 60000): string {
  const $ = cheerio.load(html);
  const root = $.root().clone();
  root.find('script, style, noscript, svg, canvas, template, iframe').remove();
  const text = root.text().replace(/\s+/g, ' ').trim();
  return text.slice(0, maxChars);
}

export function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const $ = cheerio.load(html);
  const out: { href: string; text: string }[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      const abs = new URL(href, baseUrl).href;
      out.push({ href: abs, text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 80) });
    } catch {
      /* skip */
    }
  });
  return out;
}

/** Neutral DomFacts used when a crawl is reconstructed from the database
 *  (per-page DOM facts are persisted as aggregated signals, not per page). */
export function emptyDom(): DomFacts {
  return {
    hasViewport: false, hasCanonical: false, hasHttps: false, metaDescription: '', title: '',
    h1s: [], h2s: [], ogTitle: '', jsonLdTypes: [], structuredDataBlocks: 0, formCount: 0, forms: [],
    iframeCount: 0, iframeHosts: [], imgCount: 0, imgMissingAlt: 0, scriptCount: 0, inlineScriptCount: 0,
    externalScriptHosts: [], stylesheetCount: 0, linkRels: [], telLinks: 0, mailtoLinks: 0, socialLinks: [],
    navLinkCount: 0, ctaTexts: [], hasCookieBanner: false, checkoutIndicators: [], bookingIndicators: [],
    paymentIndicators: [], analyticsIndicators: [], chatIndicators: [], cmsIndicators: [],
    ecommerceIndicators: [], bookingProviders: [], crmIndicators: [], textLength: 0,
  };
}
