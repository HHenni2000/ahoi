"""
Lightweight geocoding helper.

Uses OpenStreetMap Nominatim to enrich events with lat/lng when missing.
Includes a small on-disk cache to avoid repeated lookups.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

import httpx

from .models import Event


DEFAULT_CACHE_PATH = Path(__file__).resolve().parents[1] / "data" / "geocode_cache.json"
DEFAULT_BASE_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_USER_AGENT = "ahoi-app/1.0"


def _normalize_query(query: str) -> str:
    return " ".join(query.lower().split())


def _is_unknown(value: Optional[str]) -> bool:
    if not value:
        return True
    lowered = value.strip().lower()
    return lowered in {"unbekannt", "unknown", "k.a.", "ka"}


class Geocoder:
    def __init__(
        self,
        cache_path: Path = DEFAULT_CACHE_PATH,
        enabled: Optional[bool] = None,
        min_delay_seconds: Optional[float] = None,
        timeout_seconds: Optional[float] = None,
        user_agent: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
    ):
        self.cache_path = cache_path
        self.base_url = base_url
        self.enabled = (
            enabled
            if enabled is not None
            else os.getenv("GEOCODING_ENABLED", "true").lower() == "true"
        )
        self.min_delay_seconds = (
            min_delay_seconds
            if min_delay_seconds is not None
            else float(os.getenv("GEOCODING_MIN_DELAY_SECONDS", "1.1"))
        )
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else float(os.getenv("GEOCODING_TIMEOUT_SECONDS", "10"))
        )
        self.user_agent = user_agent or os.getenv("GEOCODING_USER_AGENT", DEFAULT_USER_AGENT)
        self._cache = self._load_cache()
        self._last_request_ts = 0.0
        self._cache_dirty = False
        self._client = httpx.Client(
            timeout=self.timeout_seconds,
            headers={"User-Agent": self.user_agent},
        )

    def _load_cache(self) -> dict:
        try:
            if self.cache_path.exists():
                return json.loads(self.cache_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        return {}

    def _save_cache(self) -> None:
        if not self._cache_dirty:
            return
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self._cache, ensure_ascii=False, indent=2), encoding="utf-8")
        self._cache_dirty = False

    def _respect_rate_limit(self) -> None:
        elapsed = time.time() - self._last_request_ts
        if elapsed < self.min_delay_seconds:
            time.sleep(self.min_delay_seconds - elapsed)

    def _build_query(self, event: Event) -> Optional[str]:
        address = event.location.address
        name = event.location.name
        district = event.location.district

        parts: list[str] = []
        if not _is_unknown(address):
            parts.append(address)
        elif not _is_unknown(name):
            parts.append(name)

        if district and district not in parts:
            parts.append(district)

        region = event.region or "hamburg"
        if region and region not in parts:
            parts.append(region)

        query = ", ".join(part for part in parts if part)
        if not query:
            return None

        if "hamburg" not in query.lower():
            query = f"{query}, Hamburg"
        if "germany" not in query.lower():
            query = f"{query}, Germany"

        return query

    def _geocode(self, query: str) -> Optional[tuple[float, float]]:
        self._respect_rate_limit()

        try:
            response = self._client.get(
                self.base_url,
                params={
                    "format": "json",
                    "limit": 1,
                    "q": query,
                    "addressdetails": 0,
                },
            )
            response.raise_for_status()
            data = response.json()
            if not data:
                return None
            lat = float(data[0]["lat"])
            lng = float(data[0]["lon"])
            self._last_request_ts = time.time()
            return lat, lng
        except Exception:
            self._last_request_ts = time.time()
            return None

    def enrich_events(self, events: list[Event]) -> int:
        if not self.enabled or not events:
            return 0

        enriched = 0
        for event in events:
            if event.location.lat is not None and event.location.lng is not None:
                continue

            query = self._build_query(event)
            if not query:
                continue

            cache_key = _normalize_query(query)
            cached = self._cache.get(cache_key)

            if isinstance(cached, dict):
                lat = cached.get("lat")
                lng = cached.get("lng")
                if lat is not None and lng is not None:
                    event.location.lat = lat
                    event.location.lng = lng
                    enriched += 1
                    continue
                if cached.get("miss") is True:
                    continue

            result = self._geocode(query)
            if result:
                lat, lng = result
                event.location.lat = lat
                event.location.lng = lng
                self._cache[cache_key] = {"lat": lat, "lng": lng}
                self._cache_dirty = True
                enriched += 1
            else:
                self._cache[cache_key] = {"miss": True}
                self._cache_dirty = True

        self._save_cache()
        return enriched

    def close(self) -> None:
        if self._client:
            self._client.close()
        self._save_cache()

    def __enter__(self) -> "Geocoder":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
