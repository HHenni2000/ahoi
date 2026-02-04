"""
Navigation Discovery Module

Stage 1 of the scraping pipeline: Find the event calendar/program URL from a root URL.

Strategy:
1. Attempt A (Code/Regex): Look for <a> tags with calendar-related keywords
2. Attempt B (LLM Fallback): If A fails, ask LLM to identify the calendar URL

Supports both static pages (httpx) and JavaScript-heavy pages (Playwright).
"""

import re
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import httpx
from openai import OpenAI

from .models import Source


# Domains that require JavaScript rendering (Playwright)
JS_REQUIRED_DOMAINS = [
    "kindaling.de",
    "kinderzeit-bremen.de",
]


def _needs_playwright(url: str) -> bool:
    """Check if a URL requires Playwright for JavaScript rendering."""
    domain = urlparse(url).netloc.lower()
    return any(js_domain in domain for js_domain in JS_REQUIRED_DOMAINS)


# Keywords that indicate a calendar/event page (German-focused)
PRIMARY_KEYWORDS = [
    "spielplan",
    "termine",
    "kalender",
    "vorstellungen",
    "auff?hrungen",
    "auffuehrungen",
    "tickets",
]

SECONDARY_KEYWORDS = [
    "programm",
    "veranstaltungen",
    "events",
    "eventkalender",
    "terminkalender",
]

DEPRIORITY_KEYWORDS = [
    "st?cke",
    "stuecke",
    "st?ck",
    "stueck",
    "repertoire",
    "produktionen",
    "produktion",
    "inszenierungen",
    "ensemble",
    "spielzeit",
    "aktuelles",
    "aktuelle st?cke",
]


class Navigator:
    """
    Discovers the event calendar URL from a given root URL.

    Uses a hybrid approach: regex-based link analysis first,
    LLM fallback if that fails.

    Supports both static pages (httpx) and JavaScript-heavy pages (Playwright).
    """

    def __init__(
        self,
        openai_client: Optional[OpenAI] = None,
        model: str = "gpt-4o-mini",
        use_playwright: bool = False,
    ):
        """
        Initialize the Navigator.

        Args:
            openai_client: OpenAI client for LLM fallback. If None, LLM fallback is disabled.
            model: OpenAI model to use for LLM calls.
            use_playwright: Force Playwright for all requests (auto-detected by default).
        """
        self.client = openai_client
        self.model = model
        self.force_playwright = use_playwright
        self.http_client = httpx.Client(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        )
    
    def discover(self, source: Source) -> Optional[str]:
        """
        Discover the event calendar URL for a source.
        
        Args:
            source: The source to analyze.
            
        Returns:
            The discovered calendar URL, or None if not found.
        """
        try:
            # Fetch the root page
            html = self._fetch_html(source.input_url)
            if not html:
                return None
            
            # Attempt A: Regex-based discovery
            target_url = self._discover_via_regex(html, source.input_url)
            if target_url:
                print(f"[Navigator] Found via regex: {target_url}")
                return target_url
            
            # Attempt B: LLM fallback
            if self.client:
                target_url = self._discover_via_llm(html, source.input_url)
                if target_url:
                    print(f"[Navigator] Found via LLM: {target_url}")
                    return target_url
            
            print(f"[Navigator] No calendar URL found for {source.input_url}")
            return None
            
        except Exception as e:
            print(f"[Navigator] Error discovering URL: {e}")
            return None
    
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
                print(f"[Navigator] httpx failed, falling back to Playwright")
                return self._fetch_html_playwright(url)
            return html

    def _fetch_html_httpx(self, url: str) -> Optional[str]:
        """Fetch HTML using httpx (for static pages)."""
        try:
            response = self.http_client.get(url)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"[Navigator] Failed to fetch {url} via httpx: {e}")
            return None

    def _fetch_html_playwright(self, url: str) -> Optional[str]:
        """
        Fetch HTML using Playwright (for JavaScript-heavy pages).

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
                        return page.content()
                    finally:
                        page.close()
                finally:
                    browser.close()

        try:
            print(f"[Navigator] Using Playwright for {url}")

            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(_fetch_in_thread)
                html = future.result(timeout=60)
                return html

        except Exception as e:
            print(f"[Navigator] Failed to fetch {url} via Playwright: {e}")
            return None
    
    def _discover_via_regex(self, html: str, base_url: str) -> Optional[str]:
        """
        Attempt A: Find calendar URL using regex pattern matching.
        
        Looks for <a> tags where href or link text contains calendar keywords.
        """
        soup = BeautifulSoup(html, "lxml")
        
        # Build regex pattern from keywords
        pattern = re.compile(
            "|".join(PRIMARY_KEYWORDS + SECONDARY_KEYWORDS),
            re.IGNORECASE
        )
        
        # Score links based on keyword matches
        candidates = []
        
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            text = link.get_text(strip=True).lower()
            
            # Skip empty or javascript links
            if not href or href.startswith(("javascript:", "#", "mailto:", "tel:")):
                continue
            
            score = 0
            
            # Check href for keywords
            href_lower = href.lower()
            for keyword in PRIMARY_KEYWORDS:
                if keyword in href_lower:
                    score += 4  # Strong signal in URL

            for keyword in SECONDARY_KEYWORDS:
                if keyword in href_lower:
                    score += 2
            
            # Check link text for keywords
            for keyword in PRIMARY_KEYWORDS:
                if keyword in text:
                    score += 3

            for keyword in SECONDARY_KEYWORDS:
                if keyword in text:
                    score += 1

            # Penalize overview/repertoire links
            for keyword in DEPRIORITY_KEYWORDS:
                if keyword in href_lower:
                    score -= 3
                if keyword in text:
                    score -= 2
            
            if score > 0:
                # Convert relative URL to absolute
                absolute_url = urljoin(base_url, href)
                candidates.append((absolute_url, score))
        
        if not candidates:
            return None
        
        # Sort by score (highest first) and return best match
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[0][0]
    
    def _discover_via_llm(self, html: str, base_url: str) -> Optional[str]:
        """
        Attempt B: Use LLM to identify the calendar URL.
        
        Sends only navigation-relevant HTML to minimize tokens.
        """
        soup = BeautifulSoup(html, "lxml")
        
        # Extract only navigation-relevant elements
        nav_elements = []
        for tag in ["nav", "header", "footer", "menu"]:
            for element in soup.find_all(tag):
                nav_elements.append(str(element))
        
        # If no nav elements found, extract all links
        if not nav_elements:
            links = []
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                text = link.get_text(strip=True)
                if href and text and not href.startswith(("javascript:", "#")):
                    links.append(f'<a href="{href}">{text}</a>')
            nav_html = "\n".join(links[:50])  # Limit to 50 links
        else:
            nav_html = "\n".join(nav_elements)
        
        # Truncate if too long
        if len(nav_html) > 8000:
            nav_html = nav_html[:8000] + "..."
        
        prompt = f"""Analyze this website's navigation HTML and identify the URL that leads to the event calendar, schedule, or specific performance dates page.

Base URL: {base_url}

Navigation HTML:
{nav_html}

Instructions:
1. Prefer links that contain concrete dates or words like: Spielplan, Termine, Kalender, Vorstellungen, Auff?hrungen
2. Avoid links that look like repertoire/overview pages (e.g., St?cke, Repertoire, Produktionen, Ensemble)
3. Return ONLY the full URL (absolute, not relative)
4. If you can't find a calendar URL, respond with: NONE

Calendar URL:"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.0,
            )
            
            result = response.choices[0].message.content.strip()
            
            if result.upper() == "NONE" or not result:
                return None
            
            # Ensure it's a valid URL
            if result.startswith("/"):
                result = urljoin(base_url, result)
            
            # Basic URL validation
            parsed = urlparse(result)
            if parsed.scheme and parsed.netloc:
                return result
            
            return None
            
        except Exception as e:
            print(f"[Navigator] LLM error: {e}")
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
