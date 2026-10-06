/**
 * Industry → OpenStreetMap tag taxonomy (spec section 17).
 *
 * Maps free-text industry input ("restaurants", "dental clinics", "law firms")
 * to Overpass filter fragments. Additions are data-only — no pipeline changes.
 * The taxonomy is intentionally broad and global; it is NOT Nigeria- or
 * US-specific.
 */

export interface IndustryMapping {
  key: string;
  /** Lower-cased substrings matched against the user's industry input. */
  aliases: string[];
  /** Overpass filter fragments WITHOUT the website constraint. */
  filters: string[];
}

export const INDUSTRY_TAXONOMY: IndustryMapping[] = [
  {
    key: 'restaurants',
    aliases: ['restaurant', 'food', 'dining', 'eatery', 'bistro', 'cafe', 'coffee shop', 'takeaway'],
    filters: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="cafe"]'],
  },
  {
    key: 'hotels',
    aliases: ['hotel', 'hospitality', 'lodging', 'guest house', 'hostel', 'motel', 'resort', 'bnb', 'bed and breakfast'],
    filters: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="hostel"]', '["tourism"="motel"]'],
  },
  {
    key: 'dental_clinics',
    aliases: ['dental', 'dentist', 'orthodont'],
    filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
  },
  {
    key: 'clinics',
    aliases: ['clinic', 'medical', 'doctor', 'health', 'healthcare', 'physician', 'gp ', 'surgery'],
    filters: ['["amenity"="clinic"]', '["amenity"="doctors"]', '["healthcare"="clinic"]'],
  },
  {
    key: 'pharmacies',
    aliases: ['pharmacy', 'chemist', 'drugstore'],
    filters: ['["amenity"="pharmacy"]'],
  },
  {
    key: 'veterinary',
    aliases: ['veterinar', 'animal clinic', 'pet care'],
    filters: ['["amenity"="veterinary"]'],
  },
  {
    key: 'legal',
    aliases: ['law', 'legal', 'attorney', 'solicitor', 'barrister', 'advocate', 'lawyer'],
    filters: ['["office"="lawyer"]'],
  },
  {
    key: 'accounting',
    aliases: ['account', 'accountant', 'bookkeep', 'tax', 'audit'],
    filters: ['["office"="accountant"]'],
  },
  {
    key: 'real_estate',
    aliases: ['real estate', 'property', 'realtor', 'estate agent', 'letting'],
    filters: ['["office"="estate_agent"]'],
  },
  {
    key: 'insurance',
    aliases: ['insurance'],
    filters: ['["office"="insurance"]'],
  },
  {
    key: 'financial',
    aliases: ['bank', 'financ', 'lending', 'loan', 'credit', 'investment', 'fintech'],
    filters: ['["amenity"="bank"]', '["office"="financial"]'],
  },
  {
    key: 'education',
    aliases: ['school', 'education', 'college', 'university', 'academy', 'tutor', 'training', 'learning', 'language school'],
    filters: ['["amenity"="school"]', '["amenity"="college"]', '["amenity"="university"]', '["amenity"="language_school"]', '["amenity"="driving_school"]'],
  },
  {
    key: 'automotive',
    aliases: ['car', 'auto', 'vehicle', 'garage', 'mechanic', 'dealership', 'automotive'],
    filters: ['["shop"="car"]', '["shop"="car_repair"]', '["shop"="car_parts"]', '["shop"="motorcycle"]'],
  },
  {
    key: 'logistics',
    aliases: ['logistic', 'shipping', 'freight', 'courier', 'delivery', 'transport', 'moving'],
    filters: ['["office"="logistics"]', '["office"="moving_company"]', '["amenity"="courier"]'],
  },
  {
    key: 'construction',
    aliases: ['construction', 'builder', 'contractor', 'building', 'roofing', 'plumb', 'electrician', 'hvac'],
    filters: ['["office"="construction_company"]', '["craft"="builder"]', '["craft"="plumber"]', '["craft"="electrician"]', '["craft"="hvac"]', '["craft"="roofer"]'],
  },
  {
    key: 'retail_fashion',
    aliases: ['fashion', 'clothing', 'apparel', 'boutique', 'retail', 'shop', 'store'],
    filters: ['["shop"="clothes"]', '["shop"="shoes"]', '["shop"="boutique"]', '["shop"="jewelry"]', '["shop"="bag"]'],
  },
  {
    key: 'beauty_wellness',
    aliases: ['beauty', 'salon', 'spa', 'hair', 'barber', 'nail', 'wellness', 'massage', 'cosmetic'],
    filters: ['["shop"="beauty"]', '["shop"="hairdresser"]', '["leisure"="spa"]', '["shop"="massage"]'],
  },
  {
    key: 'fitness',
    aliases: ['fitness', 'gym', 'yoga', 'pilates', 'sport', 'crossfit'],
    filters: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'],
  },
  {
    key: 'hospitality_bars',
    aliases: ['bar', 'pub', 'nightclub', 'brewery', 'winery'],
    filters: ['["amenity"="bar"]', '["amenity"="pub"]', '["amenity"="nightclub"]'],
  },
  {
    key: 'travel',
    aliases: ['travel', 'tour', 'agency', 'tourism operator'],
    filters: ['["shop"="travel_agency"]', '["office"="tour_operator"]'],
  },
  {
    key: 'ecommerce',
    aliases: ['ecommerce', 'e-commerce', 'online store', 'online shop', 'dtc', 'd2c', 'marketplace'],
    filters: ['["shop"="electronics"]', '["shop"="furniture"]', '["shop"="garden_centre"]', '["shop"="sports"]', '["shop"="toys"]'],
  },
  {
    key: 'saas_software',
    aliases: ['saas', 'software', 'tech', 'it ', 'startup', 'app', 'platform', 'agency', 'marketing', 'digital'],
    filters: ['["office"="it"]', '["office"="company"]', '["office"="advertising_agency"]', '["office"="consulting"]'],
  },
  {
    key: 'supermarket',
    aliases: ['supermarket', 'grocery', 'convenience', 'market'],
    filters: ['["shop"="supermarket"]', '["shop"="convenience"]', '["shop"="greengrocer"]'],
  },
  {
    key: 'bakery',
    aliases: ['bakery', 'patisserie', 'pastry'],
    filters: ['["shop"="bakery"]', '["shop"="pastry"]'],
  },
];

/** Fallback filters used when the industry is unknown / "any". Broad commercial set. */
export const FALLBACK_FILTERS: string[] = [
  '["office"]',
  '["amenity"~"^(restaurant|cafe|fast_food|dentist|clinic|doctors|pharmacy|veterinary|bank|bar|pub|nightclub)$"]',
  '["tourism"~"^(hotel|guest_house|hostel|motel)$"]',
  '["leisure"="fitness_centre"]',
  '["craft"]',
];

export interface ResolvedIndustry {
  key: string;
  filters: string[];
  matched: boolean;
}

/**
 * Resolve a free-text industry to Overpass filters.
 * Returns matched=false (with the map key 'any') when nothing matched.
 */
export function filtersForIndustry(industry?: string): ResolvedIndustry {
  const raw = (industry || '').toLowerCase().trim();
  if (!raw || raw === 'any' || raw === '*') {
    return { key: 'any', filters: FALLBACK_FILTERS, matched: false };
  }
  for (const m of INDUSTRY_TAXONOMY) {
    if (m.key === raw.replace(/\s+/g, '_')) return { key: m.key, filters: m.filters, matched: true };
    if (m.aliases.some((a) => raw.includes(a))) return { key: m.key, filters: m.filters, matched: true };
  }
  return { key: 'any', filters: FALLBACK_FILTERS, matched: false };
}

/** All taxonomy keys (for docs / validation). */
export function industryKeys(): string[] {
  return INDUSTRY_TAXONOMY.map((m) => m.key);
}
