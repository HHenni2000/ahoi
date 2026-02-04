"""
Scraping Pipeline

Orchestrates the full scraping workflow:
1. Navigation Discovery (find calendar URL)
2. Event Extraction (extract events via LLM)
3. Deduplication (remove duplicates)

This module ties together Navigator, Extractor, and Deduplicator.
"""

import time
from typing import Optional

from openai import OpenAI

from .models import Source, Event, ScrapingResult, SourceStatus
from .navigator import Navigator
from .extractor import Extractor
from .deduplicator import Deduplicator
from .geocoder import Geocoder


class ScrapingPipeline:
    """
    Full scraping pipeline for a single source.
    
    Usage:
        pipeline = ScrapingPipeline(openai_client)
        result = pipeline.run(source)
        print(f"Found {result.events_new} new events")
    """
    
    def __init__(
        self,
        openai_client: OpenAI,
        model: str = "gpt-4o-mini",
        existing_hashes: Optional[list[str]] = None,
        use_playwright: bool = False,
        enable_geocoding: Optional[bool] = None,
    ):
        """
        Initialize the scraping pipeline.

        Args:
            openai_client: OpenAI client for LLM operations.
            model: OpenAI model to use.
            existing_hashes: Optional list of existing event hashes for deduplication.
            use_playwright: Force Playwright for all requests (auto-detected by default).
        """
        self.navigator = Navigator(
            openai_client=openai_client,
            model=model,
            use_playwright=use_playwright,
        )
        self.extractor = Extractor(
            openai_client=openai_client,
            model=model,
            use_playwright=use_playwright,
        )
        self.deduplicator = Deduplicator()
        self.geocoder = Geocoder(enabled=enable_geocoding)

        if existing_hashes:
            self.deduplicator.add_existing_hashes(existing_hashes)
    
    def run(self, source: Source, skip_navigation: bool = False) -> tuple[ScrapingResult, list[Event]]:
        """
        Run the full scraping pipeline for a source.
        
        Args:
            source: The source to scrape.
            skip_navigation: If True, use source.target_url directly (if available).
            
        Returns:
            Tuple of (ScrapingResult, list of new Events).
        """
        start_time = time.time()
        total_tokens = 0
        
        result = ScrapingResult(
            source_id=source.id or "",
            success=False,
            events_found=0,
            events_new=0,
            events_updated=0,
        )
        
        try:
            # Stage 1: Navigation Discovery
            if skip_navigation and source.target_url:
                target_url = source.target_url
                print(f"[Pipeline] Using existing target URL: {target_url}")
            else:
                print(f"[Pipeline] Stage 1: Discovering calendar URL for {source.input_url}")
                target_url = self.navigator.discover(source)
                
                if not target_url:
                    # Fallback: try input_url directly
                    print(f"[Pipeline] No calendar found, trying input URL directly")
                    target_url = source.input_url
                
                # Update source with discovered URL
                source.target_url = target_url
            
            # Stage 2: Event Extraction
            print(f"[Pipeline] Stage 2: Extracting events from {target_url}")
            events = self.extractor.extract(target_url, source.name)
            total_tokens += self.extractor.last_tokens_used
            
            result.events_found = len(events)
            
            if not events:
                result.success = True
                result.tokens_used = total_tokens
                result.duration_seconds = time.time() - start_time
                return result, []
            
            # Stage 3: Deduplication
            print(f"[Pipeline] Stage 3: Deduplicating {len(events)} events")
            new_events, duplicates = self.deduplicator.process_events(events)
            
            # Set source_id on all new events
            for event in new_events:
                event.source_id = source.id

            # Enrich events with geocoding (best-effort)
            geocoded = self.geocoder.enrich_events(new_events)
            if geocoded:
                print(f"[Pipeline] Geocoded {geocoded} events")
            
            result.events_new = len(new_events)
            result.events_updated = 0  # TODO: Implement update detection
            result.success = True
            result.tokens_used = total_tokens
            result.duration_seconds = time.time() - start_time
            
            # Update source status
            source.status = SourceStatus.ACTIVE
            
            print(f"[Pipeline] Complete: {result.events_found} found, {result.events_new} new")
            
            return result, new_events
            
        except Exception as e:
            result.success = False
            result.error_message = str(e)
            result.duration_seconds = time.time() - start_time
            result.tokens_used = total_tokens
            
            # Update source status
            source.status = SourceStatus.ERROR
            source.last_error = str(e)
            
            print(f"[Pipeline] Error: {e}")

            return result, []

    def close(self):
        """Cleanup resources (Navigator and Extractor)."""
        self.navigator.close()
        self.extractor.close()
        self.geocoder.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
