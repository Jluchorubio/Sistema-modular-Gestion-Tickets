// ── Geographic data service ────────────────────────────────────────────────
// Countries: restcountries.com (already cached by ProfileSidebar/ProfileFormStep)
// States + Cities: countriesnow.space (free, no API key required)

const GEO_BASE = 'https://countriesnow.space/api/v0.1';

// ── Module-level caches ────────────────────────────────────────────────────
const _countryCache:       string[] | null = null;
const _stateCache  = new Map<string, string[]>();
const _cityCache   = new Map<string, string[]>();

let _countriesPromise: Promise<string[]> | null = null;

export const geoService = {
  async getCountries(): Promise<string[]> {
    if (_countryCache) return _countryCache;
    if (_countriesPromise) return _countriesPromise;
    _countriesPromise = fetch('https://restcountries.com/v3.1/all?fields=name')
      .then(r => r.json())
      .then((raw: Array<{ name: { common: string } }>) =>
        raw.map(c => c.name.common).sort((a, b) => a.localeCompare(b, 'es')),
      )
      .catch(() => [] as string[]);
    return _countriesPromise;
  },

  async getStates(country: string): Promise<string[]> {
    if (!country) return [];
    const key = country.toLowerCase();
    if (_stateCache.has(key)) return _stateCache.get(key)!;
    try {
      const res  = await fetch(`${GEO_BASE}/countries/states`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ country }),
      });
      const json = await res.json();
      const states: string[] = (json.data?.states ?? []).map((s: { name: string }) => s.name);
      _stateCache.set(key, states);
      return states;
    } catch {
      return [];
    }
  },

  async getCities(country: string, state: string): Promise<string[]> {
    if (!country || !state) return [];
    const key = `${country}|${state}`.toLowerCase();
    if (_cityCache.has(key)) return _cityCache.get(key)!;
    try {
      const res  = await fetch(`${GEO_BASE}/countries/state/cities`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ country, state }),
      });
      const json = await res.json();
      const cities: string[] = json.data ?? [];
      _cityCache.set(key, cities);
      return cities;
    } catch {
      return [];
    }
  },
};
