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
                data = json.loads(self.venue_path.read_text(encoding="utf-8"))
                logger.info(f"[LocationEnricher] Loaded {len(data)} venues from lookup table")
                return data
        except Exception as e:
            logger.warning(f"[LocationEnricher] Failed to load venue addresses: {e}")
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
            logger.info(f"[LocationEnricher] Saved {len(self._venue_cache)} venues to lookup table")
        except Exception as e:
            logger.warning(f"[LocationEnricher] Failed to save venue addresses: {e}")

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

        logger.info(f"[LocationEnricher] LLM prompt:\n{prompt}")

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0.0,
            )

            raw = response.choices[0].message.content.strip()
            logger.info(f"[LocationEnricher] LLM raw response:\n{raw}")

            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()

            results = json.loads(raw)
            if not isinstance(results, dict):
                logger.warning(f"[LocationEnricher] LLM returned non-dict: {type(results)}")
                return {}
            return results

        except json.JSONDecodeError as e:
            logger.warning(f"[LocationEnricher] LLM response was not valid JSON: {e}\nRaw: {raw}")
            return {}
        except Exception as e:
            logger.warning(f"[LocationEnricher] LLM location lookup failed: {e}")
            return {}

    def enrich_events(self, events: list[Event]) -> int:
        """
        Enrich events that have venue names but no addresses.

        Returns the number of events enriched.
        """
        if not events:
            return 0

        # Log full location status for ALL events
        logger.info(f"[LocationEnricher] === Location status for {len(events)} events ===")
        for i, event in enumerate(events):
            name = event.location.name or "(leer)"
            addr = event.location.address or "(leer)"
            district = event.location.district or "(leer)"
            name_unknown = _is_unknown(event.location.name)
            addr_unknown = _is_unknown(event.location.address)
            status = "OK" if not addr_unknown else ("KEIN NAME" if name_unknown else "BRAUCHT ADRESSE")
            logger.info(
                f"[LocationEnricher]   [{i+1}] {status} | "
                f"title=\"{event.title}\" | "
                f"name=\"{name}\" | "
                f"address=\"{addr}\" | "
                f"district=\"{district}\""
            )

        needs_enrichment = [e for e in events if self._needs_enrichment(e)]
        has_address = [e for e in events if not _is_unknown(e.location.address)]
        no_name = [e for e in events if _is_unknown(e.location.name) and _is_unknown(e.location.address)]

        if no_name:
            logger.warning(
                f"[LocationEnricher] !!! {len(no_name)} event(s) haben WEDER Name NOCH Adresse - "
                f"Extractor hat keine Location-Infos geliefert (kann nicht angereichert werden):"
            )
            for e in no_name:
                logger.warning(f"[LocationEnricher]   -> \"{e.title}\" (source: {e.source_id})")

        if not needs_enrichment:
            if no_name:
                logger.warning(
                    f"[LocationEnricher] Kann nichts tun: {len(no_name)} Events ohne jegliche Location-Info, "
                    f"{len(has_address)} Events haben bereits eine Adresse. "
                    f"Problem liegt beim Extractor/Vision Scraper - Location wird nicht aus der Quelle gelesen!"
                )
            else:
                logger.info(f"[LocationEnricher] Alle {len(events)} Events haben bereits eine Adresse, nichts zu tun")
            return 0

        logger.info(f"[LocationEnricher] {len(needs_enrichment)} von {len(events)} Events brauchen eine Adresse")

        enriched = 0
        local_hits = 0
        llm_hits = 0
        needs_llm: list[tuple[Event, str]] = []
        llm_results: dict = {}

        # Step 1: Try local lookup
        for event in needs_enrichment:
            venue_name = event.location.name
            key = _normalize_venue_name(venue_name)
            local = self._lookup_local(venue_name)
            if local:
                event.location.address = local["address"]
                if local.get("district"):
                    event.location.district = local["district"]
                enriched += 1
                local_hits += 1
                logger.info(f"[LocationEnricher] LOCAL HIT: \"{venue_name}\" (key=\"{key}\") -> {local['address']}")
            else:
                logger.info(f"[LocationEnricher] LOCAL MISS: \"{venue_name}\" (key=\"{key}\") -> nicht in Lookup-Tabelle")
                needs_llm.append((event, venue_name))

        # Step 2: LLM fallback for remaining venues
        if needs_llm:
            # Deduplicate venue names for the LLM call
            unique_names = list(dict.fromkeys(name for _, name in needs_llm))
            logger.info(
                f"[LocationEnricher] Frage LLM nach {len(unique_names)} unbekannten Venue(s): "
                f"{unique_names}"
            )

            llm_results = self._lookup_llm(unique_names)

            logger.info(f"[LocationEnricher] LLM Ergebnis (parsed): {json.dumps(llm_results, ensure_ascii=False)}")

            # Apply results and save to local cache
            for event, venue_name in needs_llm:
                result = llm_results.get(venue_name)
                if result and isinstance(result, dict) and result.get("address"):
                    event.location.address = result["address"]
                    if result.get("district"):
                        event.location.district = result["district"]

                    # Save to local cache for future use
                    key = _normalize_venue_name(venue_name)
                    self._venue_cache[key] = {
                        "address": result["address"],
                        "district": result.get("district"),
                    }
                    self._cache_dirty = True
                    enriched += 1
                    llm_hits += 1
                    logger.info(
                        f"[LocationEnricher] LLM HIT: \"{venue_name}\" -> "
                        f"{result['address']}, {result.get('district', '?')} (in Cache gespeichert)"
                    )
                else:
                    reason = "null/leer vom LLM" if result is None else f"ungültiges Format: {result}"
                    logger.warning(
                        f"[LocationEnricher] LLM MISS: \"{venue_name}\" -> {reason} "
                        f"*** HIER FEHLT DIE ADRESSE - Google Places API nötig? ***"
                    )

        self._save_venues()

        # Final summary
        still_missing = [e for e in events if _is_unknown(e.location.address)]
        logger.info(
            f"[LocationEnricher] === Zusammenfassung ===\n"
            f"[LocationEnricher]   Events gesamt:       {len(events)}\n"
            f"[LocationEnricher]   Brauchten Adresse:   {len(needs_enrichment)}\n"
            f"[LocationEnricher]   Lokal gefunden:      {local_hits}\n"
            f"[LocationEnricher]   LLM gefunden:        {llm_hits}\n"
            f"[LocationEnricher]   Immer noch ohne:     {len(still_missing)}"
        )
        if still_missing:
            logger.warning(f"[LocationEnricher] Events OHNE Adresse nach Enrichment:")
            for e in still_missing:
                logger.warning(
                    f"[LocationEnricher]   -> \"{e.title}\" | name=\"{e.location.name}\" | "
                    f"addr=\"{e.location.address}\" *** NICHT AUFGELÖST ***"
                )

        if enriched:
            print(f"[LocationEnricher] Enriched {enriched}/{len(needs_enrichment)} events with addresses")

        return enriched
