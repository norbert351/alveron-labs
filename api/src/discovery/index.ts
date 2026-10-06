import { config } from '../config.ts';
import type { DiscoveredBusiness, DiscoveryProvider, DiscoveryQuery } from './types.ts';
import { overpassProvider } from './overpass.ts';

/**
 * Provider registry (spec section 6).
 *
 * Additional providers (search engine, business directory, maps) register here
 * and are automatically usable by the pipeline. V1 ships the credential-free
 * OpenStreetMap provider so discovery is real today.
 */

const registry = new Map<string, DiscoveryProvider>();

export function registerProvider(p: DiscoveryProvider): void {
  registry.set(p.name, p);
}

export function listProviders(): string[] {
  return [...registry.keys()];
}

export function getProvider(name: string): DiscoveryProvider | null {
  return registry.get(name) || null;
}

export function defaultProvider(): DiscoveryProvider {
  const preferred = getProvider(config.discovery.provider);
  if (preferred) return preferred;
  const first = [...registry.values()].find((p) => p.supports({ limit: 1 }));
  if (!first) throw new Error('No discovery provider registered');
  return first;
}

// V1 registration
registerProvider(overpassProvider);

export interface DiscoveryOutcome {
  provider: string;
  results: DiscoveredBusiness[];
  error?: string;
}

/** Discover using a specific provider (or the configured default). */
export async function discover(query: DiscoveryQuery, providerName?: string): Promise<DiscoveryOutcome> {
  const provider = providerName ? getProvider(providerName) : defaultProvider();
  if (!provider) return { provider: providerName || 'unknown', results: [], error: `Unknown discovery provider: ${providerName}` };
  try {
    const results = await provider.discover(query);
    return { provider: provider.name, results };
  } catch (err: any) {
    return { provider: provider.name, results: [], error: err?.message || String(err) };
  }
}

export type { DiscoveredBusiness, DiscoveryProvider, DiscoveryQuery };
