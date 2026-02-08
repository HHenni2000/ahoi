"""
ahoi Backend API

FastAPI application for the ahoi event and idea aggregator.
"""

import json
import os
import re
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from openai import OpenAI
from pydantic import BaseModel, Field

import database as db
from gemini_discovery import discover_events, ensure_gemini_source, to_upsert_event_dict
from scraper.models import ScrapingMode, Source, SourceStatus, SourceType
from scraper.pipeline import ScrapingPipeline

# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(
    title="ahoi API",
    description="Family-friendly event and idea aggregator for Hamburg",
    version="1.1.0",
)

# CORS middleware (allow Expo app to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


NEARBY_REFERENCE = {
    "label": "22609 Hamburg",
    "postal_code": "22609",
    "lat": 53.5511,
    "lng": 9.9937,
}
ADMIN_SOURCES_FILE = Path(__file__).parent / "web" / "sources-admin.html"


def _read_non_negative_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        print(f"[API] Invalid {name}='{raw}', using default {default}")
        return default


DEFAULT_MAX_ALLOWED_AGE = _read_non_negative_int_env("EVENT_MAX_ALLOWED_AGE", 8)


# ============ Pydantic Models for API ============


class IdeaCreate(BaseModel):
    title: str
    description: str
    location_name: str
    location_address: str
    category: str
    is_indoor: bool
    age_suitability: str
    price_info: str
    location_district: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    duration_minutes: Optional[int] = None
    weather_tags: Optional[list[str]] = None
    original_link: Optional[str] = None
    region: str = "hamburg"


class IdeaUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    location_district: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    category: Optional[str] = None
    is_indoor: Optional[bool] = None
    age_suitability: Optional[str] = None
    price_info: Optional[str] = None
    duration_minutes: Optional[int] = None
    weather_tags: Optional[list[str]] = None
    original_link: Optional[str] = None
    region: Optional[str] = None
    is_active: Optional[bool] = None


class SourceCreate(BaseModel):
    name: str
    input_url: str = ""
    region: str = "hamburg"
    strategy: str = "weekly"
    source_type: str = "event"
    scraping_mode: str = "html"
    scraping_hints: Optional[str] = None
    custom_selectors: Optional[str] = None
    idea: Optional[IdeaCreate] = None


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    input_url: Optional[str] = None
    target_url: Optional[str] = None
    is_active: Optional[bool] = None
    strategy: Optional[str] = None
    region: Optional[str] = None
    source_type: Optional[str] = None
    scraping_mode: Optional[str] = None
    scraping_hints: Optional[str] = None
    custom_selectors: Optional[str] = None


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


class IdeaResponse(BaseModel):
    id: str
    source_id: Optional[str]
    title: str
    description: Optional[str]
    location_name: Optional[str]
    location_address: Optional[str]
    location_district: Optional[str]
    location_lat: Optional[float]
    location_lng: Optional[float]
    category: Optional[str]
    is_indoor: bool
    age_suitability: Optional[str]
    price_info: Optional[str]
    duration_minutes: Optional[int]
    weather_tags: Optional[list[str]]
    original_link: Optional[str]
    region: str
    is_active: bool


class NearbyReferenceResponse(BaseModel):
    label: str
    postal_code: str
    lat: float
    lng: float


class ScrapeResponse(BaseModel):
    success: bool
    events_found: int
    events_new: int
    error_message: Optional[str] = None
    duration_seconds: float


class GeminiDiscoveryRequest(BaseModel):
    query: str
    region: str = "hamburg"
    days_ahead: int = 14
    limit: int = 30
    model: Optional[str] = None


class GeminiDiscoveryResponse(BaseModel):
    success: bool
    events_found: int
    events_normalized: int
    events_new: int
    events_existing: int
    events_saved: int
    events_dropped: int
    events_dropped_validation: int
    events_dropped_persistence: int
    error_message: Optional[str] = None
    model: str
    issues: list[str] = Field(default_factory=list)
    issue_summary: dict[str, int] = Field(default_factory=dict)
    grounding_urls: list[str] = Field(default_factory=list)
    stages: dict[str, Any] = Field(default_factory=dict)
    events: list[EventResponse] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    events_count: int
    sources_count: int


def _normalize_source_type(value: Optional[str]) -> str:
    source_type = (value or "event").lower().strip()
    if source_type not in {"event", "idea"}:
        raise HTTPException(status_code=400, detail="source_type must be 'event' or 'idea'")
    return source_type


def _parse_min_age(age_suitability: Optional[str]) -> Optional[int]:
    """Extract minimum recommended age from free-text age labels."""
    if not age_suitability:
        return None

    value = age_suitability.strip().lower()
    if not value:
        return None

    if any(token in value for token in ("alle", "all ages", "familie", "ohne alters")):
        return 0

    range_match = re.search(r"(\d{1,2})\s*[-–]\s*(\d{1,2})", value)
    if range_match:
        try:
            return int(range_match.group(1))
        except ValueError:
            return None

    ab_match = re.search(r"(?:ab|mindestens|min\.?)\s*(\d{1,2})", value)
    if ab_match:
        try:
            return int(ab_match.group(1))
        except ValueError:
            return None

    plus_match = re.search(r"(\d{1,2})\s*\+", value)
    if plus_match:
        try:
            return int(plus_match.group(1))
        except ValueError:
            return None

    fallback_number = re.search(r"(\d{1,2})", value)
    if fallback_number:
        try:
            return int(fallback_number.group(1))
        except ValueError:
            return None

    return None


def _build_issue_summary(issues: list[str]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for issue in issues:
        normalized = re.sub(r"^event\[\d+\]\s*", "", issue.strip().lower())
        normalized = normalized or "unknown"
        counter[normalized] += 1
    return dict(counter)


def _is_age_allowed(age_suitability: Optional[str], max_allowed_age: Optional[int]) -> bool:
    if max_allowed_age is None:
        return True
    min_age = _parse_min_age(age_suitability)
    if min_age is None:
        return True
    return min_age <= max_allowed_age


def _resolve_nearby_reference() -> dict:
    postal_code = os.getenv("NEARBY_REF_POSTAL", "22609").strip() or "22609"
    label = os.getenv("NEARBY_REF_LABEL", f"{postal_code} Hamburg").strip() or f"{postal_code} Hamburg"

    lat_env = os.getenv("NEARBY_REF_LAT")
    lng_env = os.getenv("NEARBY_REF_LNG")

    if lat_env and lng_env:
        try:
            return {
                "label": label,
                "postal_code": postal_code,
                "lat": float(lat_env),
                "lng": float(lng_env),
            }
        except ValueError:
            print("[API] Invalid NEARBY_REF_LAT/LNG env values, falling back to geocoding")

    try:
        response = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": label, "format": "json", "limit": 1},
            headers={"User-Agent": "ahoi-backend/1.0"},
            timeout=10.0,
        )
        response.raise_for_status()
        payload = response.json()
        if payload:
            return {
                "label": label,
                "postal_code": postal_code,
                "lat": float(payload[0]["lat"]),
                "lng": float(payload[0]["lon"]),
            }
    except Exception as exc:
        print(f"[API] Failed to geocode nearby reference '{label}': {exc}")

    # Last resort fallback (Hamburg center)
    return {
        "label": label,
        "postal_code": postal_code,
        "lat": 53.5511,
        "lng": 9.9937,
    }


def _to_idea_response_row(idea: dict) -> dict:
    weather_tags_raw = idea.get("weather_tags")
    weather_tags: Optional[list[str]] = None
    if weather_tags_raw:
        try:
            parsed = json.loads(weather_tags_raw)
            if isinstance(parsed, list):
                weather_tags = [str(item) for item in parsed]
        except Exception:
            weather_tags = None

    return {
        **idea,
        "is_indoor": bool(idea.get("is_indoor")),
        "is_active": bool(idea.get("is_active")),
        "weather_tags": weather_tags,
    }


def _to_source_response_row(
    source: dict,
    counts_by_source_id: Optional[dict[str, dict[str, int]]] = None,
) -> dict:
    counts_lookup = (
        db.get_source_entry_counts([source["id"]])
        if counts_by_source_id is None
        else counts_by_source_id
    )
    counts = counts_lookup.get(
        source["id"],
        {"entries_count": 0, "events_count": 0, "ideas_count": 0},
    )
    return {
        **source,
        "is_active": bool(source.get("is_active")),
        "entries_count": int(counts.get("entries_count", 0)),
        "events_count": int(counts.get("events_count", 0)),
        "ideas_count": int(counts.get("ideas_count", 0)),
    }


# ============ Startup ============


@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    global NEARBY_REFERENCE
    db.init_db()
    NEARBY_REFERENCE = _resolve_nearby_reference()
    print("[API] Database initialized")
    print(f"[API] Nearby reference: {NEARBY_REFERENCE}")


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


# ============ Meta Endpoints ============


@app.get("/admin/sources", include_in_schema=False)
async def admin_sources_page():
    """Serve lightweight web interface for source management."""
    if not ADMIN_SOURCES_FILE.exists():
        raise HTTPException(status_code=404, detail="Admin page not found")
    return FileResponse(ADMIN_SOURCES_FILE)


@app.get("/api/meta/nearby-reference", response_model=NearbyReferenceResponse)
async def get_nearby_reference():
    """Get server-side nearby reference point (PLZ 22609 Hamburg by default)."""
    return NEARBY_REFERENCE


# ============ Events Endpoints ============


@app.get("/api/events", response_model=list[EventResponse])
async def get_events(
    region: str = Query(default="hamburg"),
    category: Optional[str] = Query(default=None),
    from_date: Optional[str] = Query(default=None, description="ISO date string"),
    to_date: Optional[str] = Query(default=None, description="ISO date string"),
    is_indoor: Optional[bool] = Query(default=None),
    max_age: Optional[int] = Query(default=None, ge=0, le=21),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Get events with optional filters."""
    effective_max_age = DEFAULT_MAX_ALLOWED_AGE if max_age is None else max_age

    if effective_max_age is None:
        events = db.get_events(
            region=region,
            category=category,
            from_date=from_date,
            to_date=to_date,
            is_indoor=is_indoor,
            limit=limit,
            offset=offset,
        )
    else:
        # Age filter is text-based, so we filter in Python after fetching a larger window.
        scan_limit = min(5000, max(500, (offset + limit) * 4))
        raw_events = db.get_events(
            region=region,
            category=category,
            from_date=from_date,
            to_date=to_date,
            is_indoor=is_indoor,
            limit=scan_limit,
            offset=0,
        )
        filtered_events = [
            event
            for event in raw_events
            if _is_age_allowed(event.get("age_suitability"), effective_max_age)
        ]
        events = filtered_events[offset : offset + limit]

    return [{**event, "is_indoor": bool(event.get("is_indoor"))} for event in events]


@app.get("/api/events/{event_id}", response_model=EventResponse)
async def get_event(event_id: str):
    """Get a single event by ID."""
    event = db.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return {**event, "is_indoor": bool(event.get("is_indoor"))}


# ============ Ideas Endpoints ============


@app.get("/api/ideas", response_model=list[IdeaResponse])
async def get_ideas(
    region: str = Query(default="hamburg"),
    category: Optional[str] = Query(default=None),
    is_indoor: Optional[bool] = Query(default=None),
    district: Optional[str] = Query(default=None),
    max_age: Optional[int] = Query(default=None, ge=0, le=21),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Get ideas with optional filters."""
    effective_max_age = DEFAULT_MAX_ALLOWED_AGE if max_age is None else max_age

    if effective_max_age is None:
        ideas = db.get_ideas(
            region=region,
            category=category,
            is_indoor=is_indoor,
            district=district,
            limit=limit,
            offset=offset,
        )
    else:
        scan_limit = min(5000, max(500, (offset + limit) * 4))
        raw_ideas = db.get_ideas(
            region=region,
            category=category,
            is_indoor=is_indoor,
            district=district,
            limit=scan_limit,
            offset=0,
        )
        filtered_ideas = [
            idea
            for idea in raw_ideas
            if _is_age_allowed(idea.get("age_suitability"), effective_max_age)
        ]
        ideas = filtered_ideas[offset : offset + limit]

    return [_to_idea_response_row(idea) for idea in ideas]


@app.get("/api/ideas/{idea_id}", response_model=IdeaResponse)
async def get_idea(idea_id: str):
    """Get a single idea by ID."""
    idea = db.get_idea(idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    return _to_idea_response_row(idea)


@app.patch("/api/ideas/{idea_id}", response_model=IdeaResponse)
async def update_idea(idea_id: str, update: IdeaUpdate):
    """Update an existing idea."""
    existing = db.get_idea(idea_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Idea not found")

    update_data = update.model_dump(exclude_unset=True)
    if "weather_tags" in update_data and update_data["weather_tags"] is not None:
        update_data["weather_tags"] = json.dumps(update_data["weather_tags"])

    updated = db.update_idea(idea_id, **update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Idea not found")
    return _to_idea_response_row(updated)


@app.delete("/api/ideas/{idea_id}")
async def delete_idea(idea_id: str):
    """Delete an idea by ID."""
    if not db.get_idea(idea_id):
        raise HTTPException(status_code=404, detail="Idea not found")
    db.delete_idea(idea_id)
    return {"deleted": True}


# ============ Sources Endpoints ============


@app.get("/api/sources")
async def get_sources(
    active_only: bool = Query(default=False),
    source_type: Optional[str] = Query(default=None),
):
    """Get all sources."""
    normalized_source_type = _normalize_source_type(source_type) if source_type else None
    sources = db.get_all_sources(active_only=active_only, source_type=normalized_source_type)
    counts_by_source_id = db.get_source_entry_counts([source["id"] for source in sources])
    return [_to_source_response_row(source, counts_by_source_id) for source in sources]


@app.post("/api/sources")
async def create_source(source: SourceCreate):
    """Create a new source (event or idea)."""
    source_type = _normalize_source_type(source.source_type)

    input_url = (source.input_url or "").strip()
    if source_type == "event" and not input_url:
        raise HTTPException(status_code=400, detail="input_url is required for event sources")

    if not input_url:
        input_url = f"manual://{source.name.lower().replace(' ', '-')[:40]}"

    new_source = db.create_source(
        name=source.name,
        input_url=input_url,
        region=source.region,
        strategy=source.strategy,
        source_type=source_type,
        scraping_mode=source.scraping_mode,
        scraping_hints=source.scraping_hints,
        custom_selectors=source.custom_selectors,
    )

    # Idea source requires an initial idea payload
    idea_response = None
    if source_type == "idea":
        if not source.idea:
            db.delete_source(new_source["id"])
            raise HTTPException(status_code=400, detail="idea payload is required for idea sources")

        weather_tags_json = json.dumps(source.idea.weather_tags) if source.idea.weather_tags else None
        idea_id = str(uuid.uuid4())
        idea_record = db.create_idea(
            {
                "id": idea_id,
                "source_id": new_source["id"],
                "title": source.idea.title,
                "description": source.idea.description,
                "location_name": source.idea.location_name,
                "location_address": source.idea.location_address,
                "location_district": source.idea.location_district,
                "location_lat": source.idea.location_lat,
                "location_lng": source.idea.location_lng,
                "category": source.idea.category,
                "is_indoor": source.idea.is_indoor,
                "age_suitability": source.idea.age_suitability,
                "price_info": source.idea.price_info,
                "duration_minutes": source.idea.duration_minutes,
                "weather_tags": weather_tags_json,
                "original_link": source.idea.original_link or (source.input_url or None),
                "region": source.idea.region or source.region,
                "is_active": True,
            }
        )
        idea_response = _to_idea_response_row(idea_record)

    response = _to_source_response_row(new_source)
    response["idea"] = idea_response
    return response


@app.get("/api/sources/{source_id}")
async def get_source(source_id: str):
    """Get a single source by ID."""
    source = db.get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    response = _to_source_response_row(source)
    if source.get("source_type") == "idea":
        idea = db.get_idea_by_source_id(source_id)
        response["idea"] = _to_idea_response_row(idea) if idea else None
    return response


@app.patch("/api/sources/{source_id}")
async def update_source(source_id: str, update: SourceUpdate):
    """Update a source."""
    existing = db.get_source(source_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Source not found")

    update_data = update.model_dump(exclude_unset=True)
    if "source_type" in update_data and update_data["source_type"] is not None:
        update_data["source_type"] = _normalize_source_type(update_data["source_type"])

    updated = db.update_source(source_id, **update_data)
    return _to_source_response_row(updated)


@app.delete("/api/sources/{source_id}")
async def delete_source(source_id: str):
    """Delete a source and its linked content."""
    if not db.get_source(source_id):
        raise HTTPException(status_code=404, detail="Source not found")

    db.delete_source(source_id)
    return {"deleted": True}


# ============ Gemini Discovery Endpoint ============


@app.post("/api/discovery/gemini", response_model=GeminiDiscoveryResponse)
async def gemini_discovery(payload: GeminiDiscoveryRequest):
    """Discover family-friendly events via Gemini Google Search grounding."""
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    region = (payload.region or "hamburg").strip().lower() or "hamburg"
    days_ahead = max(1, min(payload.days_ahead, 60))
    limit = max(1, min(payload.limit, 100))

    source = ensure_gemini_source(region=region)
    discovery = discover_events(
        query=query,
        region=region,
        days_ahead=days_ahead,
        limit=limit,
        model=payload.model,
    )

    if not discovery.get("success"):
        issues = [str(item) for item in discovery.get("issues", [])]
        issue_summary = {
            str(k): int(v)
            for k, v in (discovery.get("issue_summary", {}) or {}).items()
            if isinstance(v, int)
        }
        if not issue_summary and issues:
            issue_summary = _build_issue_summary(issues)
        search_debug = discovery.get("search_debug", {}) if isinstance(discovery.get("search_debug"), dict) else {}

        return {
            "success": False,
            "events_found": int(discovery.get("events_found", 0)),
            "events_normalized": 0,
            "events_new": 0,
            "events_existing": 0,
            "events_saved": 0,
            "events_dropped": 0,
            "events_dropped_validation": 0,
            "events_dropped_persistence": 0,
            "error_message": discovery.get("error_message"),
            "model": str(
                discovery.get("model")
                or (payload.model or os.getenv("GEMINI_MODEL") or "gemini-3-flash-preview")
            ),
            "issues": issues,
            "issue_summary": issue_summary,
            "grounding_urls": [str(url) for url in discovery.get("grounding_urls", []) if isinstance(url, str)],
            "stages": {
                "search": {
                    "events_found_raw": int(discovery.get("events_found", 0)),
                    "grounding_url_count": len(discovery.get("grounding_urls", []) or []),
                    "model": str(
                        discovery.get("model")
                        or (payload.model or os.getenv("GEMINI_MODEL") or "gemini-3-flash-preview")
                    ),
                    "timeout_seconds": search_debug.get("timeout_seconds"),
                    "retry_count": search_debug.get("retry_count"),
                },
                "normalization": {
                    "events_normalized": 0,
                    "events_dropped_validation": 0,
                    "issues_count": len(issues),
                },
                "persistence": {
                    "events_saved": 0,
                    "events_new": 0,
                    "events_existing": 0,
                    "events_dropped_persistence": 0,
                },
                "geocoding": {
                    "events_geocoded": int(discovery.get("geocoded_events", 0)),
                },
            },
            "events": [],
        }

    events = discovery.get("events", [])
    raw_found = int(discovery.get("events_found", len(events)))
    normalized_count = int(discovery.get("events_normalized", len(events)))
    dropped_validation = int(
        discovery.get("events_dropped_validation", max(raw_found - normalized_count, 0))
    )
    geocoded_events = int(discovery.get("geocoded_events", 0))
    issues = [str(item) for item in discovery.get("issues", [])]
    grounding_urls = [str(url) for url in discovery.get("grounding_urls", []) if isinstance(url, str)]
    search_debug = discovery.get("search_debug", {}) if isinstance(discovery.get("search_debug"), dict) else {}
    existing_hashes = set(db.get_event_hashes())

    saved_events: list[dict] = []
    events_new = 0
    persistence_errors = 0
    for event in events:
        try:
            event_dict = to_upsert_event_dict(event, source_id=source["id"])
            if event_dict["id"] not in existing_hashes:
                events_new += 1
            db.upsert_event(event_dict)
            existing_hashes.add(event_dict["id"])
            saved_events.append({**event_dict, "is_indoor": bool(event_dict.get("is_indoor"))})
        except Exception as exc:
            persistence_errors += 1
            issues.append(f"persistence error: {exc}")

    issue_summary = _build_issue_summary(issues)

    events_saved = len(saved_events)
    events_existing = max(events_saved - events_new, 0)
    dropped_persistence = max(normalized_count - events_saved, 0)

    return {
        "success": True,
        "events_found": raw_found,
        "events_normalized": normalized_count,
        "events_new": events_new,
        "events_existing": events_existing,
        "events_saved": events_saved,
        "events_dropped": max(raw_found - events_saved, 0),
        "events_dropped_validation": dropped_validation,
        "events_dropped_persistence": dropped_persistence,
        "error_message": None,
        "model": str(
            discovery.get("model")
            or (payload.model or os.getenv("GEMINI_MODEL") or "gemini-3-flash-preview")
        ),
        "issues": issues,
        "issue_summary": issue_summary,
        "grounding_urls": grounding_urls,
        "stages": {
            "search": {
                "events_found_raw": raw_found,
                "grounding_url_count": len(grounding_urls),
                "model": str(
                    discovery.get("model")
                    or (payload.model or os.getenv("GEMINI_MODEL") or "gemini-3-flash-preview")
                ),
                "timeout_seconds": search_debug.get("timeout_seconds"),
                "retry_count": search_debug.get("retry_count"),
            },
            "normalization": {
                "events_normalized": normalized_count,
                "events_dropped_validation": dropped_validation,
                "issues_count": len(issues),
            },
            "persistence": {
                "events_saved": events_saved,
                "events_new": events_new,
                "events_existing": events_existing,
                "events_dropped_persistence": dropped_persistence,
                "persistence_errors": persistence_errors,
            },
            "geocoding": {
                "events_geocoded": geocoded_events,
            },
        },
        "events": saved_events,
    }


# ============ Scraping Endpoints ============


@app.post("/api/sources/{source_id}/scrape", response_model=ScrapeResponse)
async def scrape_source(source_id: str):
    """Manually trigger scraping for an event source."""
    source_data = db.get_source(source_id)
    if not source_data:
        raise HTTPException(status_code=404, detail="Source not found")

    source_type = _normalize_source_type(source_data.get("source_type") or "event")
    if source_type != "event":
        raise HTTPException(status_code=400, detail="Scraping is only available for source_type='event'")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    scraping_mode_str = source_data.get("scraping_mode", "html")
    try:
        scraping_mode = ScrapingMode(scraping_mode_str)
    except ValueError:
        scraping_mode = ScrapingMode.HTML

    source = Source(
        id=source_data["id"],
        name=source_data["name"],
        input_url=source_data["input_url"],
        target_url=source_data.get("target_url"),
        is_active=bool(source_data.get("is_active")),
        status=SourceStatus(source_data.get("status", "pending")),
        strategy=source_data.get("strategy", "weekly"),
        region=source_data.get("region", "hamburg"),
        source_type=SourceType(source_data.get("source_type") or "event"),
        scraping_mode=scraping_mode,
        scraping_hints=source_data.get("scraping_hints"),
        custom_selectors=None,
    )

    existing_hashes = db.get_event_hashes()

    client = OpenAI(api_key=api_key)
    with ScrapingPipeline(client, existing_hashes=existing_hashes) as pipeline:
        result, events = pipeline.run(source)

    db.update_source(
        source_id,
        target_url=source.target_url,
        status=source.status.value,
        last_scraped=datetime.utcnow().isoformat(),
        last_error=result.error_message,
    )

    for event in events:
        event_dict = {
            "id": event.id,
            "source_id": event.source_id,
            "title": event.title,
            "description": event.description,
            "date_start": event.date_start.isoformat(),
            "date_end": event.date_end.isoformat() if event.date_end else None,
            "location_name": event.location.name,
            "location_address": event.location.address,
            "location_district": event.location.district,
            "location_lat": event.location.lat,
            "location_lng": event.location.lng,
            "category": event.category.value,
            "is_indoor": event.is_indoor,
            "age_suitability": event.age_suitability,
            "price_info": event.price_info,
            "original_link": event.original_link,
            "region": event.region,
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
