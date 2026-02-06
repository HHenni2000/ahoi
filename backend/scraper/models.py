"""
Pydantic Models for ahoi Scraper

Defines the data structures for events, sources, and scraping results.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, Dict
from pydantic import BaseModel, Field, HttpUrl


class EventCategory(str, Enum):
    """Categories for family events."""
    THEATER = "theater"
    OUTDOOR = "outdoor"
    MUSEUM = "museum"
    MUSIC = "music"
    SPORT = "sport"
    MARKET = "market"
    KREATIV = "kreativ"
    LESEN = "lesen"


class SourceStatus(str, Enum):
    """Status of a scraping source."""
    ACTIVE = "active"
    ERROR = "error"
    PENDING = "pending"


class ScrapingStrategy(str, Enum):
    """How often to scrape a source."""
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ScrapingMode(str, Enum):
    """Method to use for scraping."""
    HTML = "html"
    VISION = "vision"


class SourceType(str, Enum):
    """Type of source content."""
    EVENT = "event"
    IDEA = "idea"


class Location(BaseModel):
    """Location information for an event."""
    name: str = Field(..., description="Name of the venue")
    address: str = Field(..., description="Full address")
    district: Optional[str] = Field(None, description="Hamburg district (e.g., Altona, Eimsbüttel)")
    lat: Optional[float] = Field(None, description="Latitude for map display")
    lng: Optional[float] = Field(None, description="Longitude for map display")


class Event(BaseModel):
    """A family-friendly event extracted from a source."""
    id: Optional[str] = Field(None, description="Deduplication hash (generated)")
    source_id: Optional[str] = Field(None, description="Reference to the source")
    title: str = Field(..., description="Event title")
    description: str = Field(..., description="Short description/summary")
    date_start: datetime = Field(..., description="Start date and time")
    date_end: Optional[datetime] = Field(None, description="End date and time")
    location: Location = Field(..., description="Event location")
    category: EventCategory = Field(..., description="Event category")
    is_indoor: bool = Field(..., description="True if event is indoors")
    age_suitability: str = Field(..., description="e.g., '4+', '0-6', 'all ages'")
    price_info: str = Field(..., description="e.g., '5€', 'Free', '8-12€'")
    original_link: str = Field(..., description="Deep link to event page")
    region: str = Field(default="hamburg", description="Region for filtering")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Source(BaseModel):
    """A website source for scraping events."""
    id: Optional[str] = Field(None, description="UUID")
    name: str = Field(..., description="Human-readable name, e.g., 'Klecks Theater'")
    input_url: str = Field(..., description="User-provided URL")
    target_url: Optional[str] = Field(None, description="Discovered calendar/event URL")
    is_active: bool = Field(default=True, description="Whether to include in scraping")
    status: SourceStatus = Field(default=SourceStatus.PENDING)
    last_scraped: Optional[datetime] = Field(None)
    last_error: Optional[str] = Field(None)
    strategy: ScrapingStrategy = Field(default=ScrapingStrategy.WEEKLY)
    region: str = Field(default="hamburg")
    source_type: SourceType = Field(default=SourceType.EVENT, description="Source content type: event or idea")
    scraping_mode: ScrapingMode = Field(default=ScrapingMode.HTML, description="Scraping method: html or vision")
    scraping_hints: Optional[str] = Field(None, description="Source-specific hints for improved extraction")
    custom_selectors: Optional[Dict[str, str]] = Field(None, description="Custom CSS selectors for code-based scraping")


class ScrapingResult(BaseModel):
    """Result of a scraping operation."""
    source_id: str
    success: bool
    events_found: int = 0
    events_new: int = 0
    events_updated: int = 0
    error_message: Optional[str] = None
    tokens_used: int = 0
    duration_seconds: float = 0.0
