"""
ahoi Backend API

FastAPI application for the ahoi event aggregator.
"""

import os
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

import database as db
from scraper.models import Source, SourceStatus
from scraper.pipeline import ScrapingPipeline

# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(
    title="ahoi API",
    description="Family-friendly event aggregator for Hamburg",
    version="1.0.0",
)

# CORS middleware (allow Expo app to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Pydantic Models for API ============

class SourceCreate(BaseModel):
    name: str
    input_url: str
    region: str = "hamburg"
    strategy: str = "weekly"


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    input_url: Optional[str] = None
    target_url: Optional[str] = None
    is_active: Optional[bool] = None
    strategy: Optional[str] = None


class EventResponse(BaseModel):
    id: str
    source_id: Optional[str]
    title: str
    description: Optional[str]
    date_start: str
    date_end: Optional[str]
    location_name: Optional[str]
    location_address: Optional[str]
    location_district: Optional[str]
    location_lat: Optional[float]
    location_lng: Optional[float]
    category: Optional[str]
    is_indoor: bool
    age_suitability: Optional[str]
    price_info: Optional[str]
    original_link: Optional[str]
    region: str


class ScrapeResponse(BaseModel):
    success: bool
    events_found: int
    events_new: int
    error_message: Optional[str] = None
    duration_seconds: float


class HealthResponse(BaseModel):
    status: str
    events_count: int
    sources_count: int


# ============ Startup ============

@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    db.init_db()
    print("[API] Database initialized")


# ============ Health Check ============

@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    sources = db.get_all_sources()
    events_count = db.get_events_count()
    return {
        "status": "healthy",
        "events_count": events_count,
        "sources_count": len(sources),
    }


# ============ Events Endpoints ============

@app.get("/api/events", response_model=list[EventResponse])
async def get_events(
    region: str = Query(default="hamburg"),
    category: Optional[str] = Query(default=None),
    from_date: Optional[str] = Query(default=None, description="ISO date string"),
    to_date: Optional[str] = Query(default=None, description="ISO date string"),
    is_indoor: Optional[bool] = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Get events with optional filters."""
    events = db.get_events(
        region=region,
        category=category,
        from_date=from_date,
        to_date=to_date,
        is_indoor=is_indoor,
        limit=limit,
        offset=offset,
    )

    # Convert SQLite rows to response format
    return [
        {
            **event,
            "is_indoor": bool(event.get("is_indoor")),
        }
        for event in events
    ]


@app.get("/api/events/{event_id}", response_model=EventResponse)
async def get_event(event_id: str):
    """Get a single event by ID."""
    event = db.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return {
        **event,
        "is_indoor": bool(event.get("is_indoor")),
    }


# ============ Sources Endpoints ============

@app.get("/api/sources")
async def get_sources(active_only: bool = Query(default=False)):
    """Get all sources."""
    sources = db.get_all_sources(active_only=active_only)
    return [
        {
            **source,
            "is_active": bool(source.get("is_active")),
        }
        for source in sources
    ]


@app.post("/api/sources")
async def create_source(source: SourceCreate):
    """Create a new source."""
    new_source = db.create_source(
        name=source.name,
        input_url=source.input_url,
        region=source.region,
        strategy=source.strategy,
    )
    return {
        **new_source,
        "is_active": bool(new_source.get("is_active")),
    }


@app.get("/api/sources/{source_id}")
async def get_source(source_id: str):
    """Get a single source by ID."""
    source = db.get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return {
        **source,
        "is_active": bool(source.get("is_active")),
    }


@app.patch("/api/sources/{source_id}")
async def update_source(source_id: str, update: SourceUpdate):
    """Update a source."""
    existing = db.get_source(source_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Source not found")

    update_data = update.model_dump(exclude_unset=True)
    updated = db.update_source(source_id, **update_data)
    return {
        **updated,
        "is_active": bool(updated.get("is_active")),
    }


@app.delete("/api/sources/{source_id}")
async def delete_source(source_id: str):
    """Delete a source and its events."""
    if not db.get_source(source_id):
        raise HTTPException(status_code=404, detail="Source not found")

    db.delete_source(source_id)
    return {"deleted": True}


# ============ Scraping Endpoints ============

@app.post("/api/sources/{source_id}/scrape", response_model=ScrapeResponse)
async def scrape_source(source_id: str):
    """Manually trigger scraping for a source."""
    source_data = db.get_source(source_id)
    if not source_data:
        raise HTTPException(status_code=404, detail="Source not found")

    # Check for OpenAI API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    # Convert to Source model
    source = Source(
        id=source_data['id'],
        name=source_data['name'],
        input_url=source_data['input_url'],
        target_url=source_data.get('target_url'),
        is_active=bool(source_data.get('is_active')),
        status=SourceStatus(source_data.get('status', 'pending')),
        strategy=source_data.get('strategy', 'weekly'),
        region=source_data.get('region', 'hamburg'),
    )

    # Get existing hashes for deduplication
    existing_hashes = db.get_event_hashes()

    # Run scraping pipeline
    client = OpenAI(api_key=api_key)

    with ScrapingPipeline(client, existing_hashes=existing_hashes) as pipeline:
        result, events = pipeline.run(source)

    # Update source
    db.update_source(
        source_id,
        target_url=source.target_url,
        status=source.status.value,
        last_scraped=datetime.utcnow().isoformat(),
        last_error=result.error_message,
    )

    # Save events to database
    for event in events:
        event_dict = {
            'id': event.id,
            'source_id': event.source_id,
            'title': event.title,
            'description': event.description,
            'date_start': event.date_start.isoformat(),
            'date_end': event.date_end.isoformat() if event.date_end else None,
            'location_name': event.location.name,
            'location_address': event.location.address,
            'location_district': event.location.district,
            'location_lat': event.location.lat,
            'location_lng': event.location.lng,
            'category': event.category.value,
            'is_indoor': event.is_indoor,
            'age_suitability': event.age_suitability,
            'price_info': event.price_info,
            'original_link': event.original_link,
            'region': event.region,
        }
        db.upsert_event(event_dict)

    return {
        "success": result.success,
        "events_found": result.events_found,
        "events_new": result.events_new,
        "error_message": result.error_message,
        "duration_seconds": result.duration_seconds,
    }


# ============ Main Entry Point ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
