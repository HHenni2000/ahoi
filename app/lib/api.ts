import Constants from 'expo-constants';

import {
  Event,
  EventCategory,
  Idea,
  NearbyReference,
  Source,
  SourceType,
  ScrapingMode,
} from '@/types/event';

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

type ApiIdea = {
  id: string;
  source_id?: string | null;
  title: string;
  description?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_district?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  category?: string | null;
  is_indoor: boolean;
  age_suitability?: string | null;
  price_info?: string | null;
  duration_minutes?: number | null;
  weather_tags?: string[] | null;
  original_link?: string | null;
  region?: string | null;
  is_active?: boolean | null;
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
  source_type?: string | null;
  scraping_mode?: string | null;
  scraping_hints?: string | null;
  custom_selectors?: string | null;
};

type ApiSourceDetail = ApiSource & {
  idea?: ApiIdea | null;
};

type ApiNearbyReference = {
  label: string;
  postal_code: string;
  lat: number;
  lng: number;
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

type FetchIdeasParams = {
  region?: string;
  category?: EventCategory;
  isIndoor?: boolean;
  district?: string;
  limit?: number;
  offset?: number;
};

export type IdeaCreatePayload = {
  title: string;
  description: string;
  locationName: string;
  locationAddress: string;
  locationDistrict?: string;
  locationLat?: number;
  locationLng?: number;
  category: EventCategory;
  isIndoor: boolean;
  ageSuitability: string;
  priceInfo: string;
  durationMinutes?: number;
  weatherTags?: string[];
  originalLink?: string;
  region?: string;
};

type CreateSourcePayload = {
  name: string;
  inputUrl: string;
  region?: string;
  strategy?: 'weekly' | 'monthly';
  sourceType?: SourceType;
  scrapingMode?: ScrapingMode;
  scrapingHints?: string;
  customSelectors?: string;
  idea?: IdeaCreatePayload;
};

const validCategories: EventCategory[] = [
  'theater',
  'outdoor',
  'museum',
  'music',
  'sport',
  'market',
  'kreativ',
  'lesen',
];

const normalizeCategory = (category?: string | null): EventCategory => {
  if (!category) return 'outdoor';
  const lowered = category.toLowerCase();
  return validCategories.includes(lowered as EventCategory)
    ? (lowered as EventCategory)
    : 'outdoor';
};

const normalizeSourceType = (sourceType?: string | null): SourceType =>
  sourceType === 'idea' ? 'idea' : 'event';

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

const toIdea = (idea: ApiIdea): Idea => ({
  id: idea.id,
  sourceId: idea.source_id ?? '',
  title: idea.title,
  description: idea.description ?? '',
  location: {
    name: idea.location_name ?? 'Unbekannter Ort',
    address: idea.location_address ?? '',
    district: idea.location_district ?? undefined,
    lat: idea.location_lat ?? undefined,
    lng: idea.location_lng ?? undefined,
  },
  category: normalizeCategory(idea.category),
  isIndoor: Boolean(idea.is_indoor),
  ageSuitability: idea.age_suitability ?? 'k.A.',
  priceInfo: idea.price_info ?? 'k.A.',
  durationMinutes: idea.duration_minutes ?? undefined,
  weatherTags: idea.weather_tags ?? undefined,
  originalLink: idea.original_link ?? '',
  region: idea.region ?? 'hamburg',
  isActive: Boolean(idea.is_active ?? true),
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
  sourceType: normalizeSourceType(source.source_type),
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

export const fetchNearbyReference = async (): Promise<NearbyReference> => {
  const data = await request<ApiNearbyReference>('/api/meta/nearby-reference');
  return {
    label: data.label,
    postalCode: data.postal_code,
    lat: data.lat,
    lng: data.lng,
  };
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

export const fetchIdeas = async (params: FetchIdeasParams = {}): Promise<Idea[]> => {
  const query = buildQuery({
    region: params.region ?? 'hamburg',
    category: params.category,
    is_indoor: params.isIndoor,
    district: params.district,
    limit: params.limit,
    offset: params.offset,
  });
  const data = await request<ApiIdea[]>(`/api/ideas${query}`);
  return data.map(toIdea);
};

export const updateIdea = async (
  ideaId: string,
  updates: Partial<{
    title: string;
    description: string;
    locationName: string;
    locationAddress: string;
    locationDistrict: string;
    locationLat: number;
    locationLng: number;
    category: EventCategory;
    isIndoor: boolean;
    ageSuitability: string;
    priceInfo: string;
    durationMinutes: number;
    weatherTags: string[];
    originalLink: string;
    region: string;
    isActive: boolean;
  }>
): Promise<Idea> => {
  const data = await request<ApiIdea>(`/api/ideas/${ideaId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: updates.title,
      description: updates.description,
      location_name: updates.locationName,
      location_address: updates.locationAddress,
      location_district: updates.locationDistrict,
      location_lat: updates.locationLat,
      location_lng: updates.locationLng,
      category: updates.category,
      is_indoor: updates.isIndoor,
      age_suitability: updates.ageSuitability,
      price_info: updates.priceInfo,
      duration_minutes: updates.durationMinutes,
      weather_tags: updates.weatherTags,
      original_link: updates.originalLink,
      region: updates.region,
      is_active: updates.isActive,
    }),
  });
  return toIdea(data);
};

export const deleteIdea = async (ideaId: string): Promise<void> => {
  await request<{ deleted: boolean }>(`/api/ideas/${ideaId}`, { method: 'DELETE' });
};

export const fetchSources = async (
  activeOnly = false,
  sourceType?: SourceType
): Promise<Source[]> => {
  const query = buildQuery({ active_only: activeOnly, source_type: sourceType });
  const data = await request<ApiSource[]>(`/api/sources${query}`);
  return data.map(toSource);
};

export const fetchSourceById = async (
  sourceId: string
): Promise<{ source: Source; idea?: Idea }> => {
  const data = await request<ApiSourceDetail>(`/api/sources/${sourceId}`);
  return {
    source: toSource(data),
    idea: data.idea ? toIdea(data.idea) : undefined,
  };
};

export const createSource = async (payload: CreateSourcePayload): Promise<Source> => {
  const data = await request<ApiSource>('/api/sources', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      input_url: payload.inputUrl,
      region: payload.region ?? 'hamburg',
      strategy: payload.strategy ?? 'weekly',
      source_type: payload.sourceType ?? 'event',
      scraping_mode: payload.scrapingMode ?? 'html',
      scraping_hints: payload.scrapingHints ?? null,
      custom_selectors: payload.customSelectors ?? null,
      idea: payload.idea
        ? {
            title: payload.idea.title,
            description: payload.idea.description,
            location_name: payload.idea.locationName,
            location_address: payload.idea.locationAddress,
            location_district: payload.idea.locationDistrict ?? null,
            location_lat: payload.idea.locationLat ?? null,
            location_lng: payload.idea.locationLng ?? null,
            category: payload.idea.category,
            is_indoor: payload.idea.isIndoor,
            age_suitability: payload.idea.ageSuitability,
            price_info: payload.idea.priceInfo,
            duration_minutes: payload.idea.durationMinutes ?? null,
            weather_tags: payload.idea.weatherTags ?? null,
            original_link: payload.idea.originalLink ?? null,
            region: payload.idea.region ?? payload.region ?? 'hamburg',
          }
        : null,
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
    sourceType: SourceType;
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
      source_type: updates.sourceType,
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
