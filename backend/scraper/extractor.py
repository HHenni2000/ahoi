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
import os
from datetime import datetime
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from openai import OpenAI

from .models import Event, EventCategory, Location
from .logging_utils import get_logger, is_debug


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

Verfuegbare Links (Text -> URL):
{link_list}

Antworte NUR mit einem JSON-Array von Events im folgenden Format:
[
  {{
    "title": "Event-Titel (pr?gnant, ohne Datum im Titel)",
    "description": "Kurze Beschreibung des Events (max 200 Zeichen, was erwartet die Familie?)",
    "date_start": "2026-02-15T15:00:00",
    "date_end": "2026-02-15T17:00:00",
    "location": {{
      "name": "Veranstaltungsort (z.B. Klecks Theater, Tierpark Hagenbeck)",
      "address": "Vollst?ndige Adresse: Stra?e Hausnummer, PLZ Hamburg-Stadtteil",
      "district": "Hamburger Stadtteil (z.B. Altona, Eimsb?ttel, Wandsbek)"
    }},
    "category": "theater|outdoor|museum|music|sport|market",
    "is_indoor": true,
    "age_suitability": "4+" oder "0-3" oder "6+" oder "alle",
    "price_info": "8?" oder "5-10?" oder "Kostenlos",
    "original_link": "https://... (direkter Link zur Event-Detailseite)"
  }}
]

WICHTIG zur Location:
- Wenn die Quelle selbst ein Veranstaltungsort ist (z.B. ein Theater), verwende dessen Namen und Adresse
- Suche im Text nach Stra?ennamen, PLZ (20xxx f?r Hamburg), Stadtteilen
- "district" ist optional aber hilfreich f?r die Filterung

WICHTIG zu Terminen:
- Wenn mehrere konkrete Termine/Uhrzeiten genannt werden, erstelle EIN Event pro Termin
- Wenn nur ein Zeitraum genannt wird (z.B. 05.02-03.03) und keine einzelnen Termine vorhanden sind, setze date_start UND date_end und behandle es als durchgehend/laufend
- Wenn Formulierungen wie "jeden Samstag", "immer Sonntags" oder "Mo-Fr" plus Zeitraum vorkommen, erstelle Termine fuer jeden passenden Wochentag innerhalb des Zeitraums
- Wenn der Zeitraum nur eine Laufzeit beschreibt (Ausstellung/Produktion), verwende date_end und keine kuenstliche Terminliste

WICHTIG zu Links:
- Nutze wenn m?glich den spezifischen Detail-Link zum Event (nicht die Kalender-Uebersicht)
- Verwende dafuer die Linkliste oder Links im Text
- Falls kein Detail-Link erkennbar ist, nutze die Kalender-URL als Fallback

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
        self.max_iframes = int(os.getenv("MAX_IFRAMES", "3"))
        self.logger = get_logger(__name__)
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
            self.logger.info("Extracting events from %s", url)
            if is_debug():
                self.logger.debug(
                    "Settings: model=%s playwright=%s max_iframes=%s max_content_length=%s",
                    self.model,
                    self.force_playwright,
                    self.max_iframes,
                    self.max_content_length,
                )
            # Fetch and convert HTML
            html = self._fetch_html(url)
            if not html:
                self.logger.warning("No HTML fetched from %s", url)
                return []
            
            expanded_html = self._expand_iframes(html, url)
            markdown_content = self._html_to_markdown(expanded_html)
            link_list = self._extract_links(expanded_html, url)

            # Extract events via LLM
            events = self._extract_via_llm(markdown_content, url, source_name, link_list)

            # Fallback: try Playwright if no events and not already using it
            if (
                not events
                and not self.force_playwright
                and not _needs_playwright(url)
            ):
                self.logger.info("Retrying extraction with Playwright for %s", url)
                html_pw = self._fetch_html_playwright(url)
                if html_pw:
                    expanded_html = self._expand_iframes(html_pw, url)
                    markdown_content = self._html_to_markdown(expanded_html)
                    link_list = self._extract_links(expanded_html, url)
                    events = self._extract_via_llm(
                        markdown_content, url, source_name, link_list
                    )
            
            print(f"[Extractor] Found {len(events)} events from {url}")
            self.logger.info("Found %s events from %s", len(events), url)
            return events
            
        except Exception as e:
            print(f"[Extractor] Error extracting from {url}: {e}")
            self.logger.exception("Extractor error for %s", url)
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
            if is_debug():
                self.logger.debug("Fetched %s via httpx (%s bytes)", url, len(response.text))
            return response.text
        except Exception as e:
            print(f"[Extractor] Failed to fetch {url} via httpx: {e}")
            self.logger.warning("httpx failed for %s: %s", url, e)
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
            if is_debug():
                self.logger.debug("Using Playwright for %s", url)

            # Run Playwright in a separate thread to avoid asyncio conflicts
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(_fetch_in_thread)
                html = future.result(timeout=60)
                if html and is_debug():
                    self.logger.debug("Fetched %s via Playwright (%s bytes)", url, len(html))
                return html

        except Exception as e:
            print(f"[Extractor] Failed to fetch {url} via Playwright: {e}")
            self.logger.warning("Playwright failed for %s: %s", url, e)
            return None

    def _absolutize_links(self, html: str, base_url: str) -> str:
        """Convert relative href/src values to absolute URLs."""
        from urllib.parse import urljoin

        soup = BeautifulSoup(html, "lxml")
        for tag in soup.find_all(href=True):
            href = tag.get("href")
            if href:
                tag["href"] = urljoin(base_url, href)

        for tag in soup.find_all(src=True):
            src = tag.get("src")
            if src:
                tag["src"] = urljoin(base_url, src)

        return str(soup)

    def _expand_iframes(self, html: str, base_url: str) -> str:
        """Inline iframe HTML (best-effort) so embedded schedules are visible."""
        from urllib.parse import urljoin

        soup = BeautifulSoup(html, "lxml")
        iframes = soup.find_all("iframe", src=True)
        if not iframes:
            return html

        appended = []
        seen = set()

        for iframe in iframes:
            src = (iframe.get("src") or "").strip()
            if not src or src.startswith(("javascript:", "about:", "#")):
                continue

            iframe_url = urljoin(base_url, src)
            if iframe_url in seen:
                continue
            seen.add(iframe_url)

            if is_debug():
                self.logger.debug("Fetching iframe: %s", iframe_url)
            iframe_html = self._fetch_html_httpx(iframe_url)
            if iframe_html is None:
                iframe_html = self._fetch_html_playwright(iframe_url)

            if iframe_html:
                iframe_html = self._absolutize_links(iframe_html, iframe_url)
                appended.append(f"\n<!-- iframe:{iframe_url} -->\n{iframe_html}\n<!-- /iframe -->\n")
            else:
                if is_debug():
                    self.logger.debug("Iframe fetch failed: %s", iframe_url)

            if len(appended) >= self.max_iframes:
                break

        if not appended:
            return html

        if is_debug():
            self.logger.debug("Inlined %s iframe(s)", len(appended))
        return html + "\n" + "\n".join(appended)
    
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
        )
        
        # Clean up excessive whitespace
        lines = [line.strip() for line in markdown.split("\n")]
        markdown = "\n".join(line for line in lines if line)
        
        # Truncate if too long
        if len(markdown) > self.max_content_length:
            markdown = markdown[:self.max_content_length] + "\n\n[... Content truncated ...]"

        if is_debug():
            self.logger.debug("Markdown length: %s chars", len(markdown))

        return markdown
    
    def _extract_via_llm(
        self,
        content: str,
        source_url: str,
        source_name: str = "",
        link_list: Optional[str] = None,
    ) -> list[Event]:
        """
        Use LLM to extract events from markdown content.
        """
        user_prompt = EXTRACTION_USER_PROMPT.format(
            content=content,
            source_url=source_url,
            source_name=source_name or "Unbekannt",
            link_list=link_list or "Keine Links gefunden.",
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
            if is_debug():
                self.logger.debug("LLM tokens used: %s", self._last_tokens_used)
            
            result = response.choices[0].message.content.strip()
            
            # Parse JSON response
            events = self._parse_events(result, source_url)
            return events
            
        except Exception as e:
            print(f"[Extractor] LLM error: {e}")
            self.logger.warning("LLM error for %s: %s", source_url, e)
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
            self.logger.warning("JSON parse error: %s", e)
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
                original_link = self._normalize_url(item.get("original_link"), source_url)
                
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
                if is_debug():
                    self.logger.debug("Failed to parse event item: %s", item)
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

    def _normalize_url(self, url: Optional[str], base_url: str) -> str:
        """Normalize a URL, resolving relative links against base_url."""
        from urllib.parse import urljoin

        if not url:
            return base_url

        cleaned = url.strip()
        if not cleaned:
            return base_url

        lowered = cleaned.lower()
        if lowered in {"unbekannt", "unknown", "k.a.", "ka"}:
            return base_url

        return urljoin(base_url, cleaned)

    def _extract_links(self, html: str, base_url: str) -> str:
        """Extract and format a compact list of links (text -> absolute URL)."""
        from urllib.parse import urljoin, urlparse

        soup = BeautifulSoup(html, "lxml")
        links = []
        seen = set()

        for anchor in soup.find_all("a", href=True):
            href = anchor.get("href")
            if not href:
                continue
            href = href.strip()
            if href.startswith(("#", "mailto:", "tel:", "javascript:")):
                continue

            text = anchor.get_text(" ", strip=True)
            if not text:
                continue

            absolute = urljoin(base_url, href)
            parsed = urlparse(absolute)
            if not parsed.scheme.startswith("http"):
                continue

            key = (text.lower(), absolute)
            if key in seen:
                continue
            seen.add(key)
            links.append(f"{text} -> {absolute}")

            if len(links) >= 200:
                break

        if is_debug():
            self.logger.debug("Extracted %s links (showing up to 5): %s", len(links), links[:5])
        return "\n".join(links) if links else "Keine Links gefunden."
    
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
