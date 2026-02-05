"""
Vision-based Event Extraction Module

Screenshot-based scraping using GPT-4o Vision for robust event extraction.
Handles complex websites with iFrames, Google Sheets, and dynamic content.
"""

import base64
import json
import os
from datetime import datetime, timedelta
from io import BytesIO
from typing import Optional
from urllib.parse import urljoin, urlparse

from openai import OpenAI
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup
import httpx

from .models import Event, EventCategory, Location
from .logging_utils import get_logger


logger = get_logger(__name__)


# System prompt for vision-based extraction
VISION_EXTRACTION_SYSTEM_PROMPT = """Du bist ein Experte für die Extraktion von Veranstaltungsdaten aus Screenshots von Webseiten für Familien in Hamburg.

Deine Aufgabe:
1. Analysiere den Screenshot und extrahiere Veranstaltungen der NÄCHSTEN 14 TAGE
2. Filtere NUR familienfreundliche Events, die für Kinder ab 4 Jahren geeignet sind
3. Kategorisiere jedes Event PRÄZISE nach dem Hauptinhalt
4. WICHTIG: Extrahiere maximal 30 Events um die Response-Länge zu begrenzen

KATEGORIEN (wähle die am besten passende):
- theater: Theateraufführungen, Puppentheater, Musicals, Figurentheater, Kinderoper, Schauspiel, Lesungen mit Schauspiel
- outdoor: Outdoor-Aktivitäten, Naturerlebnisse, Spielplatz-Events, Walderlebnisse, Tierparkbesuche, Radtouren
- museum: Museumsbesuche, Ausstellungen, Führungen, Planetarium, Science Center, Workshops in Museen
- music: Konzerte für Kinder, Mitmachkonzerte, Musikworkshops, Kinderdisco, Singveranstaltungen
- sport: Sportevents, Turniere, Sportkurse, Schwimmen, Klettern, Tanzkurse, Bewegungsangebote
- market: Märkte, Flohmärkte, Festivals, Stadtteilfeste, Kinderfeste, Basare

LOCATION-EXTRAKTION (WICHTIG!):
- Extrahiere den VOLLSTÄNDIGEN Veranstaltungsort
- Suche nach: Straße + Hausnummer, PLZ, Stadtteil
- Typische Hamburger Stadtteile: Altona, Eimsbüttel, Eppendorf, Wandsbek, Barmbek, St. Pauli, HafenCity, Blankenese, Harburg
- Wenn nur der Venue-Name bekannt ist (z.B. "Klecks Theater"), verwende diesen als location.name
- Wenn eine Adresse sichtbar ist, diese VOLLSTÄNDIG in location.address übernehmen

Wichtige Regeln:
- Ignoriere Events die explizit für Erwachsene sind (z.B. "ab 16 Jahren", "Erwachsenenvorstellung")
- Wenn keine Altersangabe sichtbar ist, schätze basierend auf dem Kontext
- Preise als String formatieren (z.B. "8€", "5-10€", "Kostenlos")
- Bei unbekannten Daten "Unbekannt" verwenden
- is_indoor: true für Indoor-Events (Theater, Museum), false für Outdoor-Events
- Datum: Verwende das aktuelle Jahr 2026 wenn kein Jahr angegeben ist

Wichtig: Gib die Antwort als JSON-Array zurück:
[
  {
    "title": "Event-Titel",
    "description": "Beschreibung des Events",
    "date": "2026-02-15",
    "time": "15:00",
    "date_end": "2026-02-15" (optional, nur bei mehrtägigen Events),
    "time_end": "17:00" (optional),
    "location_name": "Venue-Name",
    "location_address": "Straße Nr, PLZ Stadt",
    "location_district": "Stadtteil",
    "category": "theater|outdoor|museum|music|sport|market",
    "is_indoor": true|false,
    "age_suitability": "4+",
    "price_info": "8€",
    "link": "https://..."
  }
]"""


def _create_user_prompt(url: str, scraping_hints: Optional[str] = None) -> str:
    """Create user prompt for vision extraction."""
    # Add dynamic date range (next 14 days)
    today = datetime.now().date()
    cutoff_date = today + timedelta(days=14)

    prompt = f"Analysiere diesen Screenshot der Webseite: {url}\n\n"
    prompt += f"WICHTIG: Heute ist der {today.strftime('%d.%m.%Y')}. Extrahiere NUR Events vom {today.strftime('%d.%m.%Y')} bis {cutoff_date.strftime('%d.%m.%Y')} (nächste 14 Tage).\n\n"

    if scraping_hints:
        prompt += f"Spezifische Hinweise für diese Quelle:\n{scraping_hints}\n\n"

    prompt += "Extrahiere familienfreundliche Veranstaltungen (ab 4 Jahren) innerhalb dieses Zeitraums und gib sie als JSON-Array zurück."

    return prompt


def _take_screenshot(url: str, full_page: bool = True) -> Optional[bytes]:
    """
    Take a screenshot of a webpage using Playwright.

    Args:
        url: URL to screenshot
        full_page: If True, capture full scrollable page. If False, only viewport.

    Returns:
        Screenshot as PNG bytes, or None if failed.
    """
    import concurrent.futures

    def _capture_in_thread():
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                ignore_https_errors=True,  # Ignore SSL certificate errors
            )
            page = context.new_page()

            logger.info(f"Loading page for screenshot: {url}")
            page.goto(url, wait_until="networkidle", timeout=30000)

            # Wait a bit for dynamic content
            page.wait_for_timeout(2000)

            # Scroll to bottom to trigger lazy loading
            if full_page:
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(1000)
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(500)

            # Take screenshot
            screenshot_bytes = page.screenshot(full_page=full_page)

            # Save screenshot for debugging (optional)
            debug_screenshot_path = os.path.join("data", "debug_screenshot.png")
            os.makedirs(os.path.dirname(debug_screenshot_path), exist_ok=True)
            with open(debug_screenshot_path, "wb") as f:
                f.write(screenshot_bytes)
            logger.info(f"Screenshot saved to {debug_screenshot_path} for debugging")

            browser.close()

            logger.info(f"Screenshot captured ({len(screenshot_bytes)} bytes)")
            return screenshot_bytes

    try:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(_capture_in_thread)
            return future.result(timeout=60)

    except PlaywrightTimeout as e:
        logger.error(f"Playwright timeout while capturing screenshot: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to capture screenshot: {e}")
        return None


def _encode_image_base64(image_bytes: bytes) -> str:
    """Encode image bytes to base64 string."""
    return base64.b64encode(image_bytes).decode("utf-8")


def _extract_events_from_vision(
    client: OpenAI,
    url: str,
    screenshot_bytes: bytes,
    scraping_hints: Optional[str] = None,
) -> list[dict]:
    """
    Extract events from screenshot using GPT-4o Vision.

    Args:
        client: OpenAI client
        url: Source URL
        screenshot_bytes: Screenshot as PNG bytes
        scraping_hints: Optional hints for extraction

    Returns:
        List of event dicts
    """
    # Encode screenshot
    base64_image = _encode_image_base64(screenshot_bytes)

    # Create prompt
    user_prompt = _create_user_prompt(url, scraping_hints)

    logger.info("Calling GPT-4o Vision for event extraction...")

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": VISION_EXTRACTION_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{base64_image}",
                                "detail": "high"  # High detail for better event extraction
                            },
                        },
                    ],
                },
            ],
            temperature=0.1,
            max_tokens=8000,  # Increased for longer event lists (e.g., Google Sheets)
        )

        # Parse response
        content = response.choices[0].message.content

        logger.info(f"GPT-4o Vision response (first 500 chars): {content[:500]}")

        # Try to extract JSON from markdown code blocks if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        events = json.loads(content)

        logger.info(f"Vision extraction found {len(events)} events")
        return events

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from vision response: {e}")
        logger.error(f"Full response content: {content}")
        return []
    except Exception as e:
        logger.error(f"Vision extraction failed: {e}")
        return []


def _parse_event_from_vision_dict(
    event_dict: dict,
    source_id: str,
    source_url: str,
    region: str = "hamburg"
) -> Optional[Event]:
    """
    Parse a raw event dict from vision extraction into Event model.

    Args:
        event_dict: Raw event dict from vision extraction
        source_id: Source ID
        source_url: Source URL for link resolution
        region: Region (default: hamburg)

    Returns:
        Event object or None if parsing failed
    """
    try:
        # Parse dates
        date_str = event_dict.get("date", "")
        time_str = event_dict.get("time", "00:00")

        # Combine date and time
        try:
            date_start = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        except ValueError:
            # Try without time
            try:
                date_start = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                logger.warning(f"Could not parse date: {date_str}")
                return None

        # Parse end date if present
        date_end = None
        date_end_str = event_dict.get("date_end")
        time_end_str = event_dict.get("time_end", "23:59")
        if date_end_str:
            try:
                date_end = datetime.strptime(f"{date_end_str} {time_end_str}", "%Y-%m-%d %H:%M")
            except ValueError:
                try:
                    date_end = datetime.strptime(date_end_str, "%Y-%m-%d")
                except ValueError:
                    pass

        # Parse category
        category_str = event_dict.get("category", "theater").lower()
        try:
            category = EventCategory(category_str)
        except ValueError:
            category = EventCategory.THEATER  # Default fallback

        # Build location
        location = Location(
            name=event_dict.get("location_name", "Unbekannt"),
            address=event_dict.get("location_address", "Unbekannt"),
            district=event_dict.get("location_district"),
            lat=None,  # Will be geocoded later
            lng=None,
        )

        # Resolve link (make absolute)
        link = event_dict.get("link", source_url)
        if not link.startswith("http"):
            link = urljoin(source_url, link)

        # Create event
        event = Event(
            source_id=source_id,
            title=event_dict.get("title", "Unbekannt"),
            description=event_dict.get("description", ""),
            date_start=date_start,
            date_end=date_end,
            location=location,
            category=category,
            is_indoor=event_dict.get("is_indoor", True),
            age_suitability=event_dict.get("age_suitability", "4+"),
            price_info=event_dict.get("price_info", "Unbekannt"),
            original_link=link,
            region=region,
        )

        return event

    except Exception as e:
        logger.error(f"Failed to parse event from vision dict: {e}")
        logger.debug(f"Event dict: {event_dict}")
        return None


def _detect_google_sheets_iframe(url: str) -> Optional[str]:
    """
    Detect if page contains a Google Sheets iframe and return its URL.

    Args:
        url: Page URL to check

    Returns:
        Google Sheets URL if found, None otherwise
    """
    try:
        # Fetch the page HTML
        response = httpx.get(url, timeout=10.0, follow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")

        # Look for Google Sheets iframes
        for iframe in soup.find_all("iframe"):
            src = iframe.get("src", "")
            if "docs.google.com/spreadsheets" in src:
                # Make absolute URL
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = urljoin(url, src)

                logger.info(f"Found Google Sheets iframe: {src}")
                print(f"[Vision] 📊 Detected Google Sheets iframe: {src}")

                # Convert to pubhtml for better screenshot rendering
                if "/pub?" in src or "/pubhtml" in src:
                    return src

        return None

    except Exception as e:
        logger.warning(f"Failed to detect iframe: {e}")
        return None


def extract_events_with_vision(
    client: OpenAI,
    url: str,
    source_id: str,
    region: str = "hamburg",
    scraping_hints: Optional[str] = None,
) -> list[Event]:
    """
    Extract events from a URL using vision-based scraping.

    Args:
        client: OpenAI client
        url: URL to scrape
        source_id: Source ID
        region: Region (default: hamburg)
        scraping_hints: Optional hints for extraction

    Returns:
        List of Event objects
    """
    logger.info(f"Starting vision-based extraction for: {url}")

    # Check for embedded Google Sheets - if found, use that URL instead
    iframe_url = _detect_google_sheets_iframe(url)
    if iframe_url:
        print(f"[Vision] 🎯 Using Google Sheets URL for screenshot instead of main page")
        url = iframe_url

    # Take screenshot
    screenshot_bytes = _take_screenshot(url, full_page=True)
    if not screenshot_bytes:
        logger.error("Failed to capture screenshot")
        return []

    # Extract events using vision
    raw_events = _extract_events_from_vision(
        client,
        url,
        screenshot_bytes,
        scraping_hints,
    )

    if not raw_events:
        logger.warning("No events extracted from vision")
        return []

    # Parse events
    events = []
    for raw_event in raw_events:
        event = _parse_event_from_vision_dict(
            raw_event,
            source_id=source_id,
            source_url=url,
            region=region,
        )
        if event:
            events.append(event)

    logger.info(f"Vision extraction completed: {len(events)} events parsed successfully")
    return events
