"""
Gemini discovery module for family-friendly event search in Hamburg.

Uses Gemini REST API with Google Search grounding and structured JSON output.
Normalizes results into the existing snake_case event shape expected by db.upsert_event.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta
from collections import Counter
from typing import Any, Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from dateutil.parser import isoparse

import database as db
from scraper.geocoder import Geocoder
from scraper.models import Event, EventCategory, Location


GEMINI_ENDPOINT_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"
HAMBURG_TIMEZONE = ZoneInfo("Europe/Berlin")
GEMINI_DISCOVERY_SOURCE_NAME = "Gemini Discovery"
GEMINI_DISCOVERY_INPUT_URL = "manual://gemini-discovery"
DEFAULT_GEMINI_TIMEOUT_SECONDS = 90.0
DEFAULT_GEMINI_RETRY_COUNT = 1
DEFAULT_GEMINI_DEBUG_TEXT_CHARS = 1200

ALLOWED_CATEGORIES = {
    "theater",
    "outdoor",
    "museum",
    "music",
    "sport",
    "market",
    "kreativ",
    "lesen",
}

UNKNOWN_TOKENS = {"unbekannt", "unknown", "k.a.", "ka", "n/a", "none"}

RESPONSE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "date_start": {"type": "string"},
                    "date_end": {"type": ["string", "null"]},
                    "location_name": {"type": ["string", "null"]},
                    "location_address": {"type": ["string", "null"]},
                    "location_district": {"type": ["string", "null"]},
                    "location_lat": {"type": ["number", "null"]},
                    "location_lng": {"type": ["number", "null"]},
                    "category": {
                        "type": "string",
                        "enum": [
                            "theater",
                            "outdoor",
                            "museum",
                            "music",
                            "sport",
                            "market",
                            "kreativ",
                            "lesen",
                        ],
                    },
                    "is_indoor": {"type": "boolean"},
                    "age_suitability": {"type": ["string", "null"]},
                    "price_info": {"type": ["string", "null"]},
                    "original_link": {"type": ["string", "null"]},
                    "region": {"type": "string"},
                },
                "required": ["title", "date_start", "category", "is_indoor", "region"],
            },
        }
    },
    "required": ["events"],
}


def _normalize_hash_component(value: Optional[str]) -> str:
    normalized = (value or "").lower().strip()
    normalized = " ".join(normalized.split())
    for char in [".", ",", "!", "?", ":", ";", "-", "–", "—", "'", '"']:
        normalized = normalized.replace(char, "")
    return normalized


def _read_positive_float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def _read_non_negative_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        return value if value >= 0 else default
    except ValueError:
        return default


def _extract_grounding_urls(payload: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return []

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        metadata = candidate.get("groundingMetadata")
        if not isinstance(metadata, dict):
            continue
        chunks = metadata.get("groundingChunks")
        if not isinstance(chunks, list):
            continue
        for chunk in chunks:
            if not isinstance(chunk, dict):
                continue
            web = chunk.get("web")
            if not isinstance(web, dict):
                continue
            uri = web.get("uri")
            if isinstance(uri, str) and uri and uri not in seen:
                seen.add(uri)
                urls.append(uri)
    return urls


def _build_issue_summary(issues: list[str]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for issue in issues:
        normalized = re.sub(r"^event\[\d+\]\s*", "", issue.strip().lower())
        normalized = normalized or "unknown"
        counter[normalized] += 1
    return dict(counter)


def _extract_events_list(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        events = data.get("events")
        if isinstance(events, list):
            return [item for item in events if isinstance(item, dict)]
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def _parse_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_optional_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.lower() in UNKNOWN_TOKENS:
        return None
    return text


def _normalize_url(value: Any) -> Optional[str]:
    text = _normalize_optional_text(value)
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return text


def _normalize_iso_datetime(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("datetime must be a non-empty string")

    parsed = isoparse(value.strip())
    if parsed.tzinfo is None:
        localized = parsed.replace(tzinfo=HAMBURG_TIMEZONE)
    else:
        localized = parsed.astimezone(HAMBURG_TIMEZONE)
    return localized.replace(microsecond=0).isoformat()


def _build_prompt(query: str, region: str, days_ahead: int, limit: int) -> str:
    today = datetime.now(HAMBURG_TIMEZONE).date()
    cutoff = today + timedelta(days=max(1, days_ahead))

    return (
        "Finde familienfreundliche Veranstaltungen fuer Kinder ab 4 Jahren in Hamburg.\n"
        f"Suchanfrage: {query}\n"
        f"Region: {region}\n"
        f"Zeitraum: {today.isoformat()} bis {cutoff.isoformat()}\n"
        f"Liefere maximal {limit} Events.\n"
        "Priorisiere Veranstaltungen von Wanderbuehnen, Zirkussen und mobilen Theatern, "
        "die oft in Zelten oder an temporaeren Standorten gastieren.\n"
        "Verwende nur Kategorien aus dem vorgegebenen Enum und gib ausschliesslich gueltiges JSON gemaess Schema zurueck."
    )


def _extract_text_from_payload(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("Gemini response does not contain candidates")

    first = candidates[0] if isinstance(candidates[0], dict) else {}
    content = first.get("content") if isinstance(first.get("content"), dict) else {}
    parts = content.get("parts")
    if not isinstance(parts, list):
        raise ValueError("Gemini response does not contain parts")

    text_parts = []
    for part in parts:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            text_parts.append(part["text"])

    text = "\n".join(text_parts).strip()
    if not text:
        raise ValueError("Gemini response does not contain text payload")
    return text


def _parse_json_text(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Defensive fallback for non-schema-compatible model output.
        match = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(1).strip())

    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        return {"events": parsed}
    raise ValueError("Gemini JSON payload must be an object or an events array")


def normalize_gemini_response(
    data: dict[str, Any], *, default_region: str = "hamburg", limit: int = 30
) -> tuple[list[dict[str, Any]], list[str]]:
    normalized: list[dict[str, Any]] = []
    issues: list[str] = []

    events = _extract_events_list(data)
    hard_limit = max(1, limit)

    for index, raw in enumerate(events):
        if len(normalized) >= hard_limit:
            break

        title = _normalize_optional_text(raw.get("title"))
        if not title:
            issues.append(f"event[{index}] missing title")
            continue

        try:
            date_start = _normalize_iso_datetime(raw.get("date_start"))
        except Exception:
            issues.append(f"event[{index}] invalid date_start")
            continue

        date_end_raw = raw.get("date_end")
        date_end: Optional[str] = None
        if date_end_raw is not None:
            try:
                date_end = _normalize_iso_datetime(date_end_raw)
            except Exception:
                date_end = None

        category_raw = _normalize_optional_text(raw.get("category"))
        if not category_raw:
            issues.append(f"event[{index}] missing category")
            continue
        category = category_raw.lower()
        if category not in ALLOWED_CATEGORIES:
            category = "outdoor"

        is_indoor = raw.get("is_indoor")
        if not isinstance(is_indoor, bool):
            issues.append(f"event[{index}] invalid is_indoor")
            continue

        region_raw = _normalize_optional_text(raw.get("region"))
        region = (region_raw or default_region or "hamburg").strip().lower()

        normalized.append(
            {
                "title": title,
                "description": _normalize_optional_text(raw.get("description")),
                "date_start": date_start,
                "date_end": date_end,
                "location_name": _normalize_optional_text(raw.get("location_name")),
                "location_address": _normalize_optional_text(raw.get("location_address")),
                "location_district": _normalize_optional_text(raw.get("location_district")),
                "location_lat": _parse_number(raw.get("location_lat")),
                "location_lng": _parse_number(raw.get("location_lng")),
                "category": category,
                "is_indoor": is_indoor,
                "age_suitability": _normalize_optional_text(raw.get("age_suitability")),
                "price_info": _normalize_optional_text(raw.get("price_info")),
                "original_link": _normalize_url(raw.get("original_link")),
                "region": region,
            }
        )

    return normalized, issues


def build_event_hash_id(event: dict[str, Any]) -> str:
    title_normalized = _normalize_hash_component(event.get("title"))
    location_normalized = _normalize_hash_component(event.get("location_name"))
    try:
        date_value = isoparse(str(event.get("date_start")))
        date_str = date_value.date().isoformat()
    except Exception:
        date_str = str(event.get("date_start", ""))[:10]

    hash_input = f"{title_normalized}|{date_str}|{location_normalized}"
    return hashlib.md5(hash_input.encode("utf-8")).hexdigest()


def to_upsert_event_dict(event: dict[str, Any], source_id: str) -> dict[str, Any]:
    return {
        "id": build_event_hash_id(event),
        "source_id": source_id,
        "title": event["title"],
        "description": event.get("description"),
        "date_start": event["date_start"],
        "date_end": event.get("date_end"),
        "location_name": event.get("location_name"),
        "location_address": event.get("location_address"),
        "location_district": event.get("location_district"),
        "location_lat": event.get("location_lat"),
        "location_lng": event.get("location_lng"),
        "category": event.get("category"),
        "is_indoor": bool(event.get("is_indoor")),
        "age_suitability": event.get("age_suitability"),
        "price_info": event.get("price_info"),
        "original_link": event.get("original_link"),
        "region": event.get("region") or "hamburg",
    }


def _enrich_missing_coordinates(events: list[dict[str, Any]]) -> int:
    if not events:
        return 0

    modeled_events: list[Event] = []
    modeled_indices: list[int] = []

    for idx, event in enumerate(events):
        if event.get("location_lat") is not None and event.get("location_lng") is not None:
            continue

        try:
            model = Event(
                id=None,
                source_id=None,
                title=event["title"],
                description=event.get("description") or "",
                date_start=isoparse(event["date_start"]),
                date_end=isoparse(event["date_end"]) if event.get("date_end") else None,
                location=Location(
                    name=event.get("location_name") or "",
                    address=event.get("location_address") or "",
                    district=event.get("location_district"),
                    lat=event.get("location_lat"),
                    lng=event.get("location_lng"),
                ),
                category=EventCategory(event["category"]),
                is_indoor=bool(event["is_indoor"]),
                age_suitability=event.get("age_suitability") or "",
                price_info=event.get("price_info") or "",
                original_link=event.get("original_link") or "",
                region=event.get("region") or "hamburg",
            )
        except Exception:
            continue

        modeled_events.append(model)
        modeled_indices.append(idx)

    if not modeled_events:
        return 0

    with Geocoder() as geocoder:
        enriched = geocoder.enrich_events(modeled_events)

    for idx, model in zip(modeled_indices, modeled_events):
        events[idx]["location_lat"] = model.location.lat
        events[idx]["location_lng"] = model.location.lng

    return enriched


def ensure_gemini_source(region: str = "hamburg") -> dict[str, Any]:
    sources = db.get_all_sources(source_type="event")
    for source in sources:
        if source.get("input_url") == GEMINI_DISCOVERY_INPUT_URL:
            if not bool(source.get("is_active")):
                db.update_source(source["id"], is_active=1, region=region)
                refreshed = db.get_source(source["id"])
                if refreshed:
                    return refreshed
            return source

    return db.create_source(
        name=GEMINI_DISCOVERY_SOURCE_NAME,
        input_url=GEMINI_DISCOVERY_INPUT_URL,
        region=region,
        strategy="weekly",
        source_type="event",
        scraping_mode="html",
    )


def discover_events(
    query: str,
    *,
    region: str = "hamburg",
    days_ahead: int = 14,
    limit: int = 30,
    model: Optional[str] = None,
) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = model or os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
    timeout_seconds = _read_positive_float_env(
        "GEMINI_TIMEOUT_SECONDS", DEFAULT_GEMINI_TIMEOUT_SECONDS
    )
    retry_count = _read_non_negative_int_env("GEMINI_RETRY_COUNT", DEFAULT_GEMINI_RETRY_COUNT)
    debug_text_chars = _read_non_negative_int_env(
        "GEMINI_DEBUG_TEXT_CHARS", DEFAULT_GEMINI_DEBUG_TEXT_CHARS
    )

    if not api_key:
        return {
            "success": False,
            "model": model_name,
            "events_found": 0,
            "events": [],
            "issues": ["GEMINI_API_KEY not configured"],
            "error_message": "GEMINI_API_KEY not configured",
        }

    request_body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": _build_prompt(
                            query=query.strip(),
                            region=region,
                            days_ahead=max(1, days_ahead),
                            limit=max(1, limit),
                        )
                    }
                ],
            }
        ],
        "tools": [{"google_search": {}}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "responseJsonSchema": RESPONSE_JSON_SCHEMA,
        },
    }

    endpoint = GEMINI_ENDPOINT_TEMPLATE.format(model=model_name)

    try:
        parsed: dict[str, Any] | None = None
        raw_text_excerpt = ""
        candidate_count = 0
        grounding_urls: list[str] = []
        for attempt in range(retry_count + 1):
            try:
                response = httpx.post(
                    endpoint,
                    params={"key": api_key},
                    json=request_body,
                    timeout=httpx.Timeout(timeout_seconds, connect=min(timeout_seconds, 20.0)),
                )
                response.raise_for_status()
                payload = response.json()
                candidates = payload.get("candidates")
                candidate_count = len(candidates) if isinstance(candidates, list) else 0
                grounding_urls = _extract_grounding_urls(payload)
                text = _extract_text_from_payload(payload)
                if debug_text_chars > 0:
                    raw_text_excerpt = text[:debug_text_chars]
                parsed = _parse_json_text(text)
                break
            except httpx.TimeoutException as exc:
                if attempt >= retry_count:
                    raise RuntimeError(
                        f"Gemini request timed out after {timeout_seconds:.0f}s "
                        f"(retries={retry_count}): {exc}"
                    ) from exc
                continue
        if parsed is None:
            raise RuntimeError("Gemini response parsing failed after retries")
    except httpx.HTTPStatusError as exc:
        detail = ""
        try:
            detail = exc.response.text
        except Exception:
            detail = ""
        error_message = f"Gemini discovery failed: {exc}"
        if detail:
            error_message = f"{error_message} | response={detail}"
        return {
            "success": False,
            "model": model_name,
            "events_found": 0,
            "events_normalized": 0,
            "events_dropped_validation": 0,
            "events": [],
            "issues": [],
            "issue_summary": {},
            "grounding_urls": [],
            "geocoded_events": 0,
            "search_debug": {
                "query": query.strip(),
                "region": region,
                "days_ahead": max(1, days_ahead),
                "limit": max(1, limit),
                "timeout_seconds": timeout_seconds,
                "retry_count": retry_count,
                "raw_text_excerpt": "",
                "candidate_count": 0,
            },
            "error_message": error_message,
        }
    except Exception as exc:
        return {
            "success": False,
            "model": model_name,
            "events_found": 0,
            "events_normalized": 0,
            "events_dropped_validation": 0,
            "events": [],
            "issues": [],
            "issue_summary": {},
            "grounding_urls": [],
            "geocoded_events": 0,
            "search_debug": {
                "query": query.strip(),
                "region": region,
                "days_ahead": max(1, days_ahead),
                "limit": max(1, limit),
                "timeout_seconds": timeout_seconds,
                "retry_count": retry_count,
                "raw_text_excerpt": "",
                "candidate_count": 0,
            },
            "error_message": f"Gemini discovery failed: {exc}",
        }

    raw_events = _extract_events_list(parsed)
    normalized, issues = normalize_gemini_response(
        parsed,
        default_region=region,
        limit=max(1, limit),
    )

    geocoded_events = 0
    try:
        geocoded_events = _enrich_missing_coordinates(normalized)
    except Exception:
        # Geocoding is best-effort and should never fail the discovery flow.
        pass

    events_found = len(raw_events)
    events_normalized = len(normalized)
    events_dropped_validation = max(events_found - events_normalized, 0)

    return {
        "success": True,
        "model": model_name,
        "events_found": events_found,
        "events_normalized": events_normalized,
        "events_dropped_validation": events_dropped_validation,
        "events": normalized,
        "issues": issues,
        "issue_summary": _build_issue_summary(issues),
        "grounding_urls": grounding_urls,
        "geocoded_events": geocoded_events,
        "search_debug": {
            "query": query.strip(),
            "region": region,
            "days_ahead": max(1, days_ahead),
            "limit": max(1, limit),
            "timeout_seconds": timeout_seconds,
            "retry_count": retry_count,
            "raw_text_excerpt": raw_text_excerpt,
            "candidate_count": candidate_count,
        },
        "error_message": None,
    }
