import Constants from 'expo-constants';

import { Event, EventCategory, Source, ScrapingMode } from '@/types/event';

const DEFAULT_API_BASE_URL = 'http://72.60.80.95:8000';

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  DEFAULT_API_BASE_URL;

const API_BASE_URL = apiBaseUrl.replace(/\/+$/, '');

type ApiEvent = {
  id: string;
  source_id?: string | null;
  title: string;
  description?: string | null;
  date_start: string;
  date_end?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_district?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  category?: string | null;
  is_indoor: boolean;
  age_suitability?: string | null;
  price_info?: string | null;
  original_link?: string | null;
  region?: string | null;
};

type ApiSource = {
  id: string;
  name: string;
  input_url: string;
  target_url?: string | null;
  is_active: boolean;
  status: 'active' | 'error' | 'pending';
  last_scraped?: string | null;
  last_error?: string | null;
  strategy: 'weekly' | 'monthly';
  region: string;
  scraping_mode?: string | null;
  scraping_hints?: string | null;
  custom_selectors?: string | null;
};

type FetchEventsParams = {
  region?: string;
  category?: EventCategory;
  fromDate?: string;
  toDate?: string;
  isIndoor?: boolean;
  limit?: number;
  offset?: number;
};

type CreateSourcePayload = {
  name: string;
  inputUrl: string;
  region?: string;
  strategy?: 'weekly' | 'monthly';
  scrapingMode?: ScrapingMode;
  scrapingHints?: string;
  customSelectors?: string;
};

const validCategories: EventCategory[] = [
  'theater',
  'outdoor',
  'museum',
  'music',
  'sport',
  'market',
];

const normalizeCategory = (category?: string | null): EventCategory => {
  if (!category) return 'outdoor';
  const lowered = category.toLowerCase();
  return validCategories.includes(lowered as EventCategory)
    ? (lowered as EventCategory)
    : 'outdoor';
};

const toEvent = (event: ApiEvent): Event => ({
  id: event.id,
  sourceId: event.source_id ?? '',
  title: event.title,
  description: event.description ?? '',
  dateStart: new Date(event.date_start),
  dateEnd: event.date_end ? new Date(event.date_end) : undefined,
  location: {
    name: event.location_name ?? 'Unbekannter Ort',
    address: event.location_address ?? '',
    district: event.location_district ?? undefined,
    lat: event.location_lat ?? undefined,
    lng: event.location_lng ?? undefined,
  },
  category: normalizeCategory(event.category),
  isIndoor: Boolean(event.is_indoor),
  ageSuitability: event.age_suitability ?? 'k.A.',
  priceInfo: event.price_info ?? 'k.A.',
  originalLink: event.original_link ?? '',
  region: event.region ?? 'hamburg',
});

const toSource = (source: ApiSource): Source => ({
  id: source.id,
  name: source.name,
  inputUrl: source.input_url,
  targetUrl: source.target_url ?? undefined,
  isActive: Boolean(source.is_active),
  status: source.status,
  lastScraped: source.last_scraped ? new Date(source.last_scraped) : undefined,
  lastError: source.last_error ?? undefined,
  strategy: source.strategy,
  region: source.region,
  scrapingMode: (source.scraping_mode ?? 'html') as ScrapingMode,
  scrapingHints: source.scraping_hints ?? undefined,
  customSelectors: source.custom_selectors ?? undefined,
});

const buildQuery = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.detail === 'string') {
        message = data.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

export const fetchEvents = async (params: FetchEventsParams = {}): Promise<Event[]> => {
  const query = buildQuery({
    region: params.region ?? 'hamburg',
    category: params.category,
    from_date: params.fromDate,
    to_date: params.toDate,
    is_indoor: params.isIndoor,
    limit: params.limit,
    offset: params.offset,
  });

  const data = await request<ApiEvent[]>(`/api/events${query}`);
  return data.map(toEvent);
};

export const fetchSources = async (activeOnly = false): Promise<Source[]> => {
  const query = buildQuery({ active_only: activeOnly });
  const data = await request<ApiSource[]>(`/api/sources${query}`);
  return data.map(toSource);
};

export const createSource = async (payload: CreateSourcePayload): Promise<Source> => {
  const data = await request<ApiSource>('/api/sources', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      input_url: payload.inputUrl,
      region: payload.region ?? 'hamburg',
      strategy: payload.strategy ?? 'weekly',
      scraping_mode: payload.scrapingMode ?? 'html',
      scraping_hints: payload.scrapingHints ?? null,
      custom_selectors: payload.customSelectors ?? null,
    }),
  });

  return toSource(data);
};

export const updateSource = async (
  sourceId: string,
  updates: Partial<{
    name: string;
    inputUrl: string;
    isActive: boolean;
    scrapingMode: ScrapingMode;
    scrapingHints: string;
  }>
): Promise<Source> => {
  const data = await request<ApiSource>(`/api/sources/${sourceId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: updates.name,
      input_url: updates.inputUrl,
      is_active: updates.isActive,
      scraping_mode: updates.scrapingMode,
      scraping_hints: updates.scrapingHints,
    }),
  });

  return toSource(data);
};

export const deleteSource = async (sourceId: string): Promise<void> => {
  await request<{ deleted: boolean }>(`/api/sources/${sourceId}`, {
    method: 'DELETE',
  });
};

export const scrapeSource = async (sourceId: string) => {
  return request<{
    success: boolean;
    events_found: number;
    events_new: number;
    error_message?: string | null;
    duration_seconds: number;
  }>(`/api/sources/${sourceId}/scrape`, { method: 'POST' });
};

