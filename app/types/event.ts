// Event types matching the backend schema

export type EventCategory = 'theater' | 'outdoor' | 'museum' | 'music' | 'sport' | 'market';

export interface Location {
  name: string;
  address: string;
  district?: string;
  lat?: number;
  lng?: number;
}

export interface Event {
  id: string;
  sourceId: string;
  title: string;
  description: string;
  dateStart: Date;
  dateEnd?: Date;
  location: Location;
  category: EventCategory;
  isIndoor: boolean;
  ageSuitability: string;
  priceInfo: string;
  originalLink: string;
  region: string;
}

export type ScrapingMode = 'html' | 'vision';

export interface Source {
  id: string;
  name: string;
  inputUrl: string;
  targetUrl?: string;
  isActive: boolean;
  status: 'active' | 'error' | 'pending';
  lastScraped?: Date;
  lastError?: string;
  strategy: 'weekly' | 'monthly';
  region: string;
  scrapingMode: ScrapingMode;
  scrapingHints?: string;
  customSelectors?: string; // JSON string
}

// Filter options for the feed
export interface EventFilters {
  category?: EventCategory;
  isIndoor?: boolean;
  dateRange?: 'today' | 'tomorrow' | 'weekend' | 'week';
  maxDistance?: number; // in km
}
