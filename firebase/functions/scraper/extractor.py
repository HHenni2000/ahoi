"""
Event Extraction Module

Stage 2 of the scraping pipeline: Extract events from a calendar page using LLM.

Strategy:
1. Fetch the calendar page HTML (httpx for static, Playwright for JS-heavy sites)
2. Convert HTML to Markdown (reduces tokens significantly)
3. Send to LLM with structured output schema
4. Filter for family-friendly events suitable for children 4+
"""

import json
from datetime import datetime
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from openai import OpenAI

from .models import Event, EventCategory, Location


# Domains that require JavaScript rendering (Playwright)
JS_REQUIRED_DOMAINS = [
    "kindaling.de",
    "kinderzeit-bremen.de",
    # Add more domains as discovered
]


def _needs_playwright(url: str) -> bool:
    """Check if a URL requires Playwright for JavaScript rendering."""
    from urllib.parse import urlparse
    domain = urlparse(url).netloc.lower()
    return any(js_domain in domain for js_domain in JS_REQUIRED_DOMAINS)


# System prompt for event extraction
EXTRACTION_SYSTEM_PROMPT = """Du bist ein Experte für die Extraktion von Veranstaltungsdaten aus Webseiten für Familien in Hamburg.

Deine Aufgabe:
1. Extrahiere ALLE Veranstaltungen aus dem bereitgestellten Text
2. Filtere NUR familienfreundliche Events, die für Kinder ab 4 Jahren geeignet sind
3. Kategorisiere jedes Event PRÄZISE nach dem Hauptinhalt:

KATEGORIEN (wähle die am besten passende):
- theater: Theateraufführungen, Puppentheater, Musicals, Figurentheater, Kinderoper, Schauspiel, Lesungen mit Schauspiel
- outdoor: Outdoor-Aktivitäten, Naturerlebnisse, Spielplatz-Events, Walderlebnisse, Tierparkbesuche, Radtouren, Wanderungen, Picknicks
- museum: Museumsbesuche, Ausstellungen, Führungen, Planetarium, Science Center, interaktive Ausstellungen, Workshops in Museen
- music: Konzerte für Kinder, Mitmachkonzerte, Musikworkshops, Kinderdisco, Singveranstaltungen
- sport: Sportevents, Turniere, Sportkurse, Schwimmen, Klettern, Tanzkurse, Bewegungsangebote, Zirkusworkshops
- market: Märkte, Flohmärkte, Festivals, Stadtteilfeste, Kinderfeste, Basare, Weihnachtsmärkte, Oster-Events

KATEGORISIERUNGS-PRIORISIERUNG:
- Wenn ein Theater auch Musik hat → "theater" (Hauptattraktion)
- Wenn ein Museum einen Workshop anbietet → "museum" (Ort ist entscheidend)
- Zirkus mit Aufführung → "theater", Zirkusworkshop zum Mitmachen → "sport"
- Kinder-Flohmarkt → "market", nicht "outdoor" auch wenn draußen

LOCATION-EXTRAKTION (WICHTIG!):
- Extrahiere den VOLLSTÄNDIGEN Veranstaltungsort
- Suche nach: Straße + Hausnummer, PLZ, Stadtteil
- Typische Hamburger Stadtteile: Altona, Eimsbüttel, Eppendorf, Wandsbek, Barmbek, St. Pauli, HafenCity, Blankenese, Harburg, Bergedorf, Winterhude, Ottensen, Uhlenhorst
- Wenn nur der Venue-Name bekannt ist (z.B. "Klecks Theater"), verwende diesen als location.name
- Wenn eine Adresse im Text vorkommt, diese VOLLSTÄNDIG in location.address übernehmen
- Bei bekannten Hamburger Venues die Standardadresse verwenden falls bekannt

Wichtige Regeln:
- Ignoriere Events die explizit für Erwachsene sind (z.B. "Abendvorstellung für Erwachsene", "ab 16 Jahren")
- Wenn keine Altersangabe vorhanden ist, schätze basierend auf dem Kontext
- Preise immer als String formatieren (z.B. "8€", "5-10€", "Kostenlos", "Eintritt frei")
- Bei unbekannten Daten "Unbekannt" verwenden
- is_indoor: true für Indoor-Events (Theater, Museum, Hallen), false für Outdoor-Events (Parks, Märkte im Freien)
- Datum: Verwende das aktuelle Jahr 2026 wenn kein Jahr angegeben ist"""


EXTRACTION_USER_PROMPT = """Extrahiere alle familienfreundlichen Veranstaltungen aus diesem Text.

Quelle: {source_name}
URL: {source_url}

Webseiten-Inhalt:
{content}

Antworte NUR mit einem JSON-Array von Events im folgenden Format:
[
  {{
    "title": "Event-Titel (prägnant, ohne Datum im Titel)",
    "description": "Kurze Beschreibung des Events (max 200 Zeichen, was erwartet die Familie?)",
    "date_start": "2026-02-15T15:00:00",
    "date_end": "2026-02-15T17:00:00",
    "location": {{
      "name": "Veranstaltungsort (z.B. Klecks Theater, Tierpark Hagenbeck)",
      "address": "Vollständige Adresse: Straße Hausnummer, PLZ Hamburg-Stadtteil",
      "district": "Hamburger Stadtteil (z.B. Altona, Eimsbüttel, Wandsbek)"
    }},
    "category": "theater|outdoor|museum|music|sport|market",
    "is_indoor": true,
    "age_suitability": "4+" oder "0-3" oder "6+" oder "alle",
    "price_info": "8€" oder "5-10€" oder "Kostenlos",
    "original_link": "https://... (direkter Link zum Event falls vorhanden)"
  }}
]

WICHTIG zur Location:
- Wenn die Quelle selbst ein Veranstaltungsort ist (z.B. ein Theater), verwende dessen Namen und Adresse
- Suche im Text nach Straßennamen, PLZ (20xxx für Hamburg), Stadtteilen
- "district" ist optional aber hilfreich für die Filterung

Wenn keine passenden Events gefunden werden, antworte mit: []"""


class Extractor:
    """
    Extracts family-friendly events from a calendar page using LLM.

    Converts HTML to Markdown first to reduce token usage,
    then uses structured output to get clean event data.

    Supports both static pages (httpx) and JavaScript-heavy pages (Playwright).
    """

    def __init__(
        self,
        openai_client: OpenAI,
        model: str = "gpt-4o-mini",
        max_content_length: int = 15000,
        use_playwright: bool = False,
    ):
        """
        Initialize the Extractor.

        Args:
            openai_client: OpenAI client (required).
            model: OpenAI model to use.
            max_content_length: Maximum content length before truncation.
            use_playwright: Force Playwright for all requests (auto-detected by default).
        """
        self.client = openai_client
        self.model = model
        self.max_content_length = max_content_length
        self.force_playwright = use_playwright
        self.http_client = httpx.Client(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        )
        self._last_tokens_used = 0
    
    @property
    def last_tokens_used(self) -> int:
        """Returns the token count from the last extraction."""
        return self._last_tokens_used
    
    def extract(self, url: str, source_name: str = "") -> list[Event]:
        """
        Extract events from a calendar page URL.
        
        Args:
            url: The calendar page URL to scrape.
            source_name: Name of the source (for context).
            
        Returns:
            List of extracted Event objects.
        """
        try:
            # Fetch and convert HTML
            html = self._fetch_html(url)
            if not html:
                return []
            
            markdown_content = self._html_to_markdown(html)

            # Extract events via LLM
            events = self._extract_via_llm(markdown_content, url, source_name)
            
            print(f"[Extractor] Found {len(events)} events from {url}")
            return events
            
        except Exception as e:
            print(f"[Extractor] Error extracting from {url}: {e}")
            return []
    
    def _fetch_html(self, url: str) -> Optional[str]:
        """
        Fetch HTML content from a URL.

        Automatically uses Playwright for JavaScript-heavy sites.
        Falls back to Playwright if httpx fails (e.g., SSL errors).
        """
        use_playwright = self.force_playwright or _needs_playwright(url)

        if use_playwright:
            return self._fetch_html_playwright(url)
        else:
            # Try httpx first, fall back to Playwright on failure
            html = self._fetch_html_httpx(url)
            if html is None:
                print(f"[Extractor] httpx failed, falling back to Playwright")
                return self._fetch_html_playwright(url)
            return html

    def _fetch_html_httpx(self, url: str) -> Optional[str]:
        """Fetch HTML using httpx (for static pages)."""
        try:
            response = self.http_client.get(url)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"[Extractor] Failed to fetch {url} via httpx: {e}")
            return None

    def _fetch_html_playwright(self, url: str) -> Optional[str]:
        """
        Fetch HTML using Playwright (for JavaScript-heavy pages).

        Waits for the page to fully render before extracting HTML.
        Uses a separate thread to avoid asyncio conflicts.
        """
        import concurrent.futures

        def _fetch_in_thread():
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                try:
                    page = browser.new_page(
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    )
                    try:
                        page.goto(url, wait_until="networkidle", timeout=30000)
                        page.wait_for_timeout(2000)
                        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        page.wait_for_timeout(1000)
                        return page.content()
                    finally:
                        page.close()
                finally:
                    browser.close()

        try:
            print(f"[Extractor] Using Playwright for {url}")

            # Run Playwright in a separate thread to avoid asyncio conflicts
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(_fetch_in_thread)
                html = future.result(timeout=60)
                return html

        except Exception as e:
            print(f"[Extractor] Failed to fetch {url} via Playwright: {e}")
            return None
    
    def _html_to_markdown(self, html: str) -> str:
        """
        Convert HTML to Markdown to reduce token count.
        
        Removes scripts, styles, and other non-content elements first.
        """
        soup = BeautifulSoup(html, "lxml")
        
        # Remove non-content elements
        for tag in soup(["script", "style", "noscript", "iframe", "svg", "img"]):
            tag.decompose()
        
        # Remove hidden elements
        for element in soup.find_all(style=lambda x: x and "display:none" in x.replace(" ", "")):
            element.decompose()
        
        # Find main content area if possible
        main_content = None
        for selector in ["main", "article", "[role='main']", ".content", "#content", ".main"]:
            main_content = soup.select_one(selector)
            if main_content:
                break
        
        # Use main content if found, otherwise use body
        content_html = str(main_content) if main_content else str(soup.body or soup)
        
        # Convert to markdown
        markdown = md(
            content_html,
            heading_style="ATX",
            bullets="-",
            strip=["a"],  # Keep link text but remove href to save tokens
        )
        
        # Clean up excessive whitespace
        lines = [line.strip() for line in markdown.split("\n")]
        markdown = "\n".join(line for line in lines if line)
        
        # Truncate if too long
        if len(markdown) > self.max_content_length:
            markdown = markdown[:self.max_content_length] + "\n\n[... Content truncated ...]"
        
        return markdown
    
    def _extract_via_llm(self, content: str, source_url: str, source_name: str = "") -> list[Event]:
        """
        Use LLM to extract events from markdown content.
        """
        user_prompt = EXTRACTION_USER_PROMPT.format(
            content=content,
            source_url=source_url,
            source_name=source_name or "Unbekannt"
        )
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=4000,
                temperature=0.1,
            )
            
            # Track token usage
            self._last_tokens_used = response.usage.total_tokens if response.usage else 0
            
            result = response.choices[0].message.content.strip()
            
            # Parse JSON response
            events = self._parse_events(result, source_url)
            return events
            
        except Exception as e:
            print(f"[Extractor] LLM error: {e}")
            return []
    
    def _parse_events(self, json_str: str, source_url: str) -> list[Event]:
        """
        Parse LLM JSON response into Event objects.
        """
        # Handle markdown code blocks
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]
        
        json_str = json_str.strip()
        
        if not json_str or json_str == "[]":
            return []
        
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"[Extractor] JSON parse error: {e}")
            return []
        
        if not isinstance(data, list):
            data = [data]
        
        events = []
        for item in data:
            try:
                # Parse location
                loc_data = item.get("location", {})
                location = Location(
                    name=loc_data.get("name", "Unbekannt"),
                    address=loc_data.get("address", "Unbekannt"),
                    district=loc_data.get("district"),
                    lat=loc_data.get("lat"),
                    lng=loc_data.get("lng"),
                )
                
                # Parse category
                category_str = item.get("category", "theater").lower()
                try:
                    category = EventCategory(category_str)
                except ValueError:
                    category = EventCategory.THEATER
                
                # Parse dates
                date_start = self._parse_date(item.get("date_start"))
                date_end = self._parse_date(item.get("date_end"))
                
                if not date_start:
                    continue  # Skip events without start date
                
                # Build original link
                original_link = item.get("original_link", source_url)
                
                event = Event(
                    title=item.get("title", "Unbekannt"),
                    description=item.get("description", "")[:500],
                    date_start=date_start,
                    date_end=date_end,
                    location=location,
                    category=category,
                    is_indoor=item.get("is_indoor", True),
                    age_suitability=item.get("age_suitability", "4+"),
                    price_info=item.get("price_info", "Unbekannt"),
                    original_link=original_link,
                )
                events.append(event)
                
            except Exception as e:
                print(f"[Extractor] Failed to parse event: {e}")
                continue
        
        return events
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse a date string into a datetime object."""
        if not date_str:
            return None
        
        formats = [
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d",
            "%d.%m.%Y %H:%M",
            "%d.%m.%Y",
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        
        return None
    
    def close(self):
        """Cleanup resources."""
        if hasattr(self, 'http_client') and self.http_client:
            self.http_client.close()

    def __del__(self):
        """Cleanup on garbage collection."""
        self.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
