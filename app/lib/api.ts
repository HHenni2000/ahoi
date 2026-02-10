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
  entries_count?: number | null;
  events_count?: number | null;
  ideas_count?: number | null;
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
  maxAge?: number;
  limit?: number;
  offset?: number;
};

type FetchIdeasParams = {
  region?: string;
  category?: EventCategory;
  isIndoor?: boolean;
  district?: string;
  maxAge?: number;
  limit?: number;
  offset?: number;
};

export type GeminiDiscoveryPayload = {
  query: string;
  region?: string;
  daysAhead?: number;
  limit?: number;
  model?: string;
};

export type GeminiDiscoveryStages = {
  search: {
    eventsFoundRaw: number;
    groundingUrlCount: number;
    model: string;
    timeoutSeconds?: number;
    retryCount?: number;
  };
  normalization: {
    eventsNormalized: number;
    eventsDroppedValidation: number;
    issuesCount: number;
  };
  persistence: {
    eventsSaved: number;
    eventsNew: number;
    eventsExisting: number;
    eventsDroppedPersistence: number;
    persistenceErrors?: number;
  };
  geocoding: {
    eventsGeocoded: number;
  };
};

export type GeminiDiscoveryResult = {
  success: boolean;
  eventsFound: number;
  eventsNormalized: number;
  eventsNew: number;
  eventsExisting: number;
  eventsSaved: number;
  eventsDropped: number;
  eventsDroppedValidation: number;
  eventsDroppedPersistence: number;
  errorMessage?: string | null;
  model: string;
  issues: string[];
  issueSummary: Record<string, number>;
  groundingUrls: string[];
  stages: GeminiDiscoveryStages;
  events: Event[];
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
  entriesCount: source.entries_count ?? 0,
  eventsCount: source.events_count ?? 0,
  ideasCount: source.ideas_count ?? 0,
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
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Network request failed';
    throw new Error(`${message}. API base URL: ${API_BASE_URL}`);
  }

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
    max_age: params.maxAge,
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
    max_age: params.maxAge,
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

export type IdeaAutofillResult = {
  success: boolean;
  title?: string | null;
  description?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_district?: string | null;
  category?: string | null;
  is_indoor?: boolean | null;
  age_suitability?: string | null;
  price_info?: string | null;
  duration_minutes?: number | null;
  original_link?: string | null;
  error_message?: string | null;
};

export const autofillIdea = async (params: {
  name: string;
  url?: string;
  region?: string;
}): Promise<IdeaAutofillResult> => {
  return request<IdeaAutofillResult>('/api/ideas/autofill', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      url: params.url || null,
      region: params.region ?? 'hamburg',
    }),
  });
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

export const scrapeAllSources = async () => {
  return request<{
    success: boolean;
    sources_total: number;
    sources_scraped: number;
    sources_failed: number;
    total_events_found: number;
    total_events_new: number;
  }>('/api/sources/scrape-all', { method: 'POST' });
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

export const discoverEventsWithGemini = async (
  payload: GeminiDiscoveryPayload
): Promise<GeminiDiscoveryResult> => {
  const data = await request<{
    success: boolean;
    events_found: number;
    events_normalized: number;
    events_new: number;
    events_existing: number;
    events_saved: number;
    events_dropped: number;
    events_dropped_validation: number;
    events_dropped_persistence: number;
    error_message?: string | null;
    model: string;
    issues?: string[] | null;
    issue_summary?: Record<string, number> | null;
    grounding_urls?: string[] | null;
    stages?: {
      search?: {
        events_found_raw?: number;
        grounding_url_count?: number;
        model?: string;
        timeout_seconds?: number;
        retry_count?: number;
      };
      normalization?: {
        events_normalized?: number;
        events_dropped_validation?: number;
        issues_count?: number;
      };
      persistence?: {
        events_saved?: number;
        events_new?: number;
        events_existing?: number;
        events_dropped_persistence?: number;
        persistence_errors?: number;
      };
      geocoding?: {
        events_geocoded?: number;
      };
    } | null;
    events: ApiEvent[];
  }>('/api/discovery/gemini', {
    method: 'POST',
    body: JSON.stringify({
      query: payload.query,
      region: payload.region ?? 'hamburg',
      days_ahead: payload.daysAhead ?? 14,
      limit: payload.limit ?? 30,
      model: payload.model ?? null,
    }),
  });

  return {
    success: data.success,
    eventsFound: data.events_found,
    eventsNormalized: data.events_normalized,
    eventsNew: data.events_new,
    eventsExisting: data.events_existing,
    eventsSaved: data.events_saved,
    eventsDropped: data.events_dropped,
    eventsDroppedValidation: data.events_dropped_validation,
    eventsDroppedPersistence: data.events_dropped_persistence,
    errorMessage: data.error_message ?? null,
    model: data.model,
    issues: data.issues ?? [],
    issueSummary: data.issue_summary ?? {},
    groundingUrls: data.grounding_urls ?? [],
    stages: {
      search: {
        eventsFoundRaw: data.stages?.search?.events_found_raw ?? data.events_found,
        groundingUrlCount: data.stages?.search?.grounding_url_count ?? (data.grounding_urls?.length ?? 0),
        model: data.stages?.search?.model ?? data.model,
        timeoutSeconds: data.stages?.search?.timeout_seconds,
        retryCount: data.stages?.search?.retry_count,
      },
      normalization: {
        eventsNormalized: data.stages?.normalization?.events_normalized ?? data.events_normalized,
        eventsDroppedValidation:
          data.stages?.normalization?.events_dropped_validation ?? data.events_dropped_validation,
        issuesCount: data.stages?.normalization?.issues_count ?? (data.issues?.length ?? 0),
      },
      persistence: {
        eventsSaved: data.stages?.persistence?.events_saved ?? data.events_saved,
        eventsNew: data.stages?.persistence?.events_new ?? data.events_new,
        eventsExisting: data.stages?.persistence?.events_existing ?? data.events_existing,
        eventsDroppedPersistence:
          data.stages?.persistence?.events_dropped_persistence ?? data.events_dropped_persistence,
        persistenceErrors: data.stages?.persistence?.persistence_errors,
      },
      geocoding: {
        eventsGeocoded: data.stages?.geocoding?.events_geocoded ?? 0,
      },
    },
    events: (data.events ?? []).map(toEvent),
  };
};
