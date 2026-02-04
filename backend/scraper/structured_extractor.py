"""
Structured Event Extractor

Extracts events from structured HTML pages (e.g., theater schedules)
using pattern matching and regex instead of LLM.

Works well for pages with clear patterns like:
- Event Title
  - Date 1 + Link
  - Date 2 + Link
  - Date 3 + Link
"""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from .logging_utils import get_logger, is_debug


@dataclass
class RawEvent:
    """
    Raw event extracted via structured parsing.
    Contains multiple dates for the same event.
    """
    title: str
    dates: list[datetime]  # All performance dates
    links: list[str]  # Ticket/detail links for each date
    location_hint: Optional[str] = None
    description_hint: Optional[str] = None


class StructuredExtractor:
    """
    Extracts events from structured HTML using pattern matching.

    Recognizes common theater schedule patterns:
    - "Fr 06.Feb - 19:30h" style dates
    - "06.02.2026 19:30" style dates
    - Event titles followed by date lists
    """

    def __init__(self):
        self.logger = get_logger(__name__)

        # Date patterns to recognize
        self.date_patterns = [
            # "Fr 06.Feb - 19:30h" or "Sa 07.Feb - 19:30"
            r'(?P<day>\w{2})\s+(?P<date>\d{1,2})\.(?P<month>\w{3,})\s*-?\s*(?P<time>\d{1,2}:\d{2})',
            # "06.02.2026 19:30" or "06.02. 19:30"
            r'(?P<date>\d{1,2})\.(?P<month>\d{1,2})\.(?:(?P<year>\d{4}))?\s+(?P<time>\d{1,2}:\d{2})',
            # "2026-02-06 19:30" or "2026-02-06T19:30"
            r'(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<date>\d{1,2})[T\s](?P<time>\d{1,2}:\d{2})',
        ]

        # Month name mappings (German)
        self.month_names = {
            'jan': 1, 'januar': 1, 'feb': 2, 'februar': 2, 'mär': 3, 'maerz': 3, 'märz': 3,
            'apr': 4, 'april': 4, 'mai': 5, 'jun': 6, 'juni': 6,
            'jul': 7, 'juli': 7, 'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
            'okt': 10, 'oktober': 10, 'nov': 11, 'november': 11, 'dez': 12, 'dezember': 12,
        }

    def extract(self, html: str, base_url: str) -> list[RawEvent]:
        """
        Try to extract events using structured pattern matching.

        Args:
            html: The HTML content to parse.
            base_url: Base URL for resolving relative links.

        Returns:
            List of RawEvent objects, or empty list if no structure detected.
        """
        try:
            soup = BeautifulSoup(html, "lxml")

            # Try different extraction strategies
            events = []

            # Strategy 1: Title + Date List (most common for theaters)
            events.extend(self._extract_title_with_dates(soup, base_url))

            if events:
                self.logger.info("Structured extraction found %d events", len(events))
                if is_debug():
                    for event in events[:3]:
                        self.logger.debug(
                            "Raw event: %s with %d dates",
                            event.title,
                            len(event.dates)
                        )
                return events

            self.logger.info("No structured patterns detected")
            return []

        except Exception as e:
            self.logger.warning("Structured extraction failed: %s", e)
            return []

    def _extract_title_with_dates(self, soup: BeautifulSoup, base_url: str) -> list[RawEvent]:
        """
        Extract events that follow pattern: Title → List of dates.

        Common in theater schedules where one production has multiple dates.
        """
        events = []

        # Find all headings (potential event titles)
        for heading in soup.find_all(['h1', 'h2', 'h3', 'h4']):
            title = heading.get_text(strip=True)
            if not title or len(title) < 3:
                continue

            # Skip navigation headings
            if any(skip in title.lower() for skip in ['spielplan', 'termine', 'kalender', 'navigation', 'menu', 'kontakt']):
                continue

            # Look for dates after this heading
            dates_and_links = self._find_dates_after_element(heading, base_url)

            if len(dates_and_links) >= 2:  # At least 2 dates to consider it a schedule
                dates = [d for d, _ in dates_and_links]
                links = [l for _, l in dates_and_links]

                # Try to find description near the heading
                description_hint = self._find_description_near(heading)

                event = RawEvent(
                    title=title,
                    dates=dates,
                    links=links,
                    description_hint=description_hint,
                )
                events.append(event)

                if is_debug():
                    self.logger.debug(
                        "Found event '%s' with %d dates",
                        title[:50],
                        len(dates)
                    )

        return events

    def _find_dates_after_element(
        self,
        element: Tag,
        base_url: str,
        max_distance: int = 500
    ) -> list[tuple[datetime, str]]:
        """
        Find date patterns in elements following the given element.

        Returns:
            List of (datetime, link_url) tuples.
        """
        results = []

        # Get next siblings (same level)
        current = element.next_sibling
        chars_searched = 0

        while current and chars_searched < max_distance:
            if isinstance(current, Tag):
                # Search in this element
                text = current.get_text()
                chars_searched += len(text)

                # Look for date patterns in text
                for pattern in self.date_patterns:
                    for match in re.finditer(pattern, text, re.IGNORECASE):
                        parsed_date = self._parse_date_match(match)
                        if parsed_date:
                            # Try to find link near this date
                            link = self._find_link_near_text(current, match.group(0), base_url)
                            results.append((parsed_date, link or base_url))

                # Also check direct links with date text
                for link_tag in current.find_all('a', href=True):
                    link_text = link_tag.get_text(strip=True)
                    for pattern in self.date_patterns:
                        match = re.search(pattern, link_text, re.IGNORECASE)
                        if match:
                            parsed_date = self._parse_date_match(match)
                            if parsed_date:
                                href = urljoin(base_url, link_tag['href'])
                                results.append((parsed_date, href))

            elif isinstance(current, str):
                chars_searched += len(current)

            current = current.next_sibling

        return results

    def _parse_date_match(self, match: re.Match) -> Optional[datetime]:
        """Parse a regex match into a datetime object."""
        try:
            groups = match.groupdict()

            # Extract date components
            day_num = int(groups.get('date', 1))

            # Month
            month_str = groups.get('month', '1')
            if month_str.isdigit():
                month_num = int(month_str)
            else:
                month_num = self.month_names.get(month_str.lower()[:3], 1)

            # Year
            year_str = groups.get('year')
            if year_str:
                year_num = int(year_str)
            else:
                # Assume current year or next year if month has passed
                now = datetime.now()
                year_num = now.year
                if month_num < now.month:
                    year_num += 1

            # Time
            time_str = groups.get('time', '00:00')
            hour, minute = map(int, time_str.split(':'))

            return datetime(year_num, month_num, day_num, hour, minute)

        except (ValueError, AttributeError) as e:
            self.logger.debug("Failed to parse date: %s", e)
            return None

    def _find_link_near_text(self, element: Tag, text: str, base_url: str) -> Optional[str]:
        """Find a link tag near the given text."""
        # Check if element itself is a link
        if element.name == 'a' and element.get('href'):
            return urljoin(base_url, element['href'])

        # Check parent
        if element.parent and element.parent.name == 'a' and element.parent.get('href'):
            return urljoin(base_url, element.parent['href'])

        # Check siblings
        for sibling in list(element.next_siblings)[:3]:
            if isinstance(sibling, Tag) and sibling.name == 'a' and sibling.get('href'):
                return urljoin(base_url, sibling['href'])

        return None

    def _find_description_near(self, heading: Tag, max_length: int = 300) -> Optional[str]:
        """Try to find a description paragraph near the heading."""
        # Look for <p> tags after the heading
        current = heading.next_sibling
        while current:
            if isinstance(current, Tag):
                if current.name == 'p':
                    text = current.get_text(strip=True)
                    if text and len(text) > 20:
                        return text[:max_length]
                # Stop at next heading
                elif current.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                    break
            current = current.next_sibling

        return None
