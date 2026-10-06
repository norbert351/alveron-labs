/**
 * Discovery provider abstraction (spec section 6).
 *
 * The engine never hard-codes a single discovery source. V1 ships a real,
 * credential-free provider (OpenStreetMap Overpass + Nominatim geocoding).
 * Search / directory / maps providers can be added behind the same interface
 * without touching the pipeline.
 */

export interface DiscoveryQuery {
  country?: string;
  region?: string;
  city?: string;
  industry?: string;
  language?: string;
  /** Maximum number of businesses to return. */
  limit: number;
  /** When false, results without a website are allowed (default true). */
  website_required?: boolean;
}

export interface DiscoveredBusiness {
  provider: string;
  /** Provider-native stable id (used for company identity + dedupe). */
  external_id: string;
  name: string;
  website?: string;
  domain?: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  /** Raw provider payload, preserved for auditability. */
  raw: Record<string, unknown>;
}

export interface DiscoveryProvider {
  readonly name: string;
  /** Whether this provider can serve the given query. */
  supports(q: DiscoveryQuery): boolean;
  discover(q: DiscoveryQuery): Promise<DiscoveredBusiness[]>;
}

export interface ResolvedLocation {
  query: string;
  display_name: string;
  country?: string;
  region?: string;
  city?: string;
  /** [south, north, west, east] as strings (Nominatim format). */
  boundingbox: [string, string, string, string];
  latitude: number;
  longitude: number;
}
