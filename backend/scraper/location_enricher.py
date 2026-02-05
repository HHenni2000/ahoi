"""
Location Enricher Module

Enriches events that have a venue name but no usable address.
Uses a two-step approach:
1. Local lookup table (venue_addresses.json) - fast, free, reliable
2. LLM fallback for unknown venues - covers the long tail
Newly found addresses are saved back to the lookup table automatically.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from openai import OpenAI

from .models import Event
from .logging_utils import get_logger

DEFAULT_VENUE_PATH = Path(__file__).resolve().parents[1] / "data" / "venue_addresses.json"

logger = get_logger(__name__)


def _is_unknown(value: Optional[str]) -> bool:
    if not value:
        return True
    lowered = value.strip().lower()
    return lowered in {"unbekannt", "unknown", "k.a.", "ka", ""}


def _normalize_venue_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


class LocationEnricher:
    """
    Enriches events with missing addresses by looking up venue names
    in a local table and falling back to LLM knowledge.
    """

    def __init__(
        self,
        openai_client: OpenAI,
        model: str = "gpt-4o-mini",
        venue_path: Path = DEFAULT_VENUE_PATH,
    ):
        self.client = openai_client
        self.model = model
        self.venue_path = venue_path
        self._venue_cache = self._load_venues()
        self._cache_dirty = False

    def _load_venues(self) -> dict:
        try:
            if self.venue_path.exists():
                return json.loads(self.venue_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to load venue addresses: {e}")
        return {}

    def _save_venues(self) -> None:
        if not self._cache_dirty:
            return
        try:
            self.venue_path.parent.mkdir(parents=True, exist_ok=True)
            self.venue_path.write_text(
                json.dumps(self._venue_cache, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            self._cache_dirty = False
        except Exception as e:
            logger.warning(f"Failed to save venue addresses: {e}")

    def _needs_enrichment(self, event: Event) -> bool:
        """Check if an event has a venue name but no usable address."""
        has_name = not _is_unknown(event.location.name)
        missing_address = _is_unknown(event.location.address)
        return has_name and missing_address

    def _lookup_local(self, venue_name: str) -> Optional[dict]:
        """Look up a venue in the local cache."""
        key = _normalize_venue_name(venue_name)
        return self._venue_cache.get(key)

    def _lookup_llm(self, venue_names: list[str]) -> dict[str, dict]:
        """Ask the LLM for addresses of unknown venues (batch call)."""
        if not venue_names:
            return {}

        venues_str = "\n".join(f"- {name}" for name in venue_names)

        prompt = f"""Du bist ein Experte für Veranstaltungsorte in Hamburg.
Finde die vollständigen Adressen für diese Veranstaltungsorte:

{venues_str}

Antworte NUR mit einem JSON-Objekt im folgenden Format:
{{
  "Venue Name": {{
    "address": "Straße Hausnummer, PLZ Hamburg",
    "district": "Stadtteil"
  }},
  "Anderer Venue": null
}}

REGELN:
- Gib die Adresse NUR an wenn du dir SICHER bist dass sie korrekt ist
- Wenn du unsicher bist oder den Ort nicht kennst, gib null zurück
- Verwende das exakte Format: "Straße Hausnummer, PLZ Hamburg"
- District ist der Hamburger Stadtteil (z.B. Altona, Eimsbüttel, Wandsbek)"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0.0,
            )

            raw = response.choices[0].message.content.strip()

            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()

            results = json.loads(raw)
            if not isinstance(results, dict):
                return {}
            return results

        except Exception as e:
            logger.warning(f"LLM location lookup failed: {e}")
            return {}

    def enrich_events(self, events: list[Event]) -> int:
        """
        Enrich events that have venue names but no addresses.

        Returns the number of events enriched.
        """
        if not events:
            return 0

        needs_enrichment = [e for e in events if self._needs_enrichment(e)]
        if not needs_enrichment:
            return 0

        enriched = 0
        needs_llm: list[tuple[Event, str]] = []

        # Step 1: Try local lookup
        for event in needs_enrichment:
            venue_name = event.location.name
            local = self._lookup_local(venue_name)
            if local:
                event.location.address = local["address"]
                if local.get("district"):
                    event.location.district = local["district"]
                enriched += 1
                logger.info(f"Local lookup hit: '{venue_name}' -> {local['address']}")
            else:
                needs_llm.append((event, venue_name))

        # Step 2: LLM fallback for remaining venues
        if needs_llm:
            # Deduplicate venue names for the LLM call
            unique_names = list(dict.fromkeys(name for _, name in needs_llm))
            logger.info(f"Querying LLM for {len(unique_names)} unknown venue(s)...")

            llm_results = self._lookup_llm(unique_names)

            # Apply results and save to local cache
            for event, venue_name in needs_llm:
                result = llm_results.get(venue_name)
                if result and isinstance(result, dict) and result.get("address"):
                    event.location.address = result["address"]
                    if result.get("district"):
                        event.location.district = result["district"]
                    enriched += 1

                    # Save to local cache for future use
                    key = _normalize_venue_name(venue_name)
                    self._venue_cache[key] = {
                        "address": result["address"],
                        "district": result.get("district"),
                    }
                    self._cache_dirty = True
                    logger.info(f"LLM lookup hit: '{venue_name}' -> {result['address']} (saved to cache)")
                else:
                    logger.info(f"No address found for: '{venue_name}'")

        self._save_venues()

        if enriched:
            print(f"[LocationEnricher] Enriched {enriched}/{len(needs_enrichment)} events with addresses")

        return enriched
