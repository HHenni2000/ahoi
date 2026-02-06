#!/usr/bin/env python3
"""
Scrape All Sources

Cron script to scrape all active sources.
Run via cron: 0 3 * * 0 /opt/ahoi/venv/bin/python /opt/ahoi/backend/scrape_all.py
"""

import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
from openai import OpenAI

import database as db
from scraper.models import Source, SourceStatus, SourceType, ScrapingMode
from scraper.pipeline import ScrapingPipeline

# Load environment variables
load_dotenv()


def scrape_all_sources():
    """Scrape all active sources."""
    print(f"\n{'='*60}")
    print(f"[scrape_all] Starting at {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    # Initialize database
    db.init_db()

    # Check for OpenAI API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[ERROR] OPENAI_API_KEY not configured")
        sys.exit(1)

    # Get all active sources
    sources = db.get_all_sources(active_only=True, source_type="event")
    print(f"[scrape_all] Found {len(sources)} active sources\n")

    if not sources:
        print("[scrape_all] No active sources to scrape")
        return

    # Get existing hashes for deduplication
    existing_hashes = db.get_event_hashes()
    print(f"[scrape_all] {len(existing_hashes)} existing events in database\n")

    # Initialize OpenAI client
    client = OpenAI(api_key=api_key)

    # Statistics
    total_events_found = 0
    total_events_new = 0
    successful = 0
    failed = 0

    # Process each source
    for i, source_data in enumerate(sources, 1):
        print(f"\n[{i}/{len(sources)}] Processing: {source_data['name']}")
        print(f"    URL: {source_data['input_url']}")

        # Convert to Source model
        source = Source(
            id=source_data['id'],
            name=source_data['name'],
            input_url=source_data['input_url'],
            target_url=source_data.get('target_url'),
            is_active=bool(source_data.get('is_active')),
            status=SourceStatus(source_data.get('status', 'pending')),
            strategy=source_data.get('strategy', 'weekly'),
            region=source_data.get('region', 'hamburg'),
            source_type=SourceType(source_data.get('source_type') or 'event'),
            scraping_mode=ScrapingMode(source_data.get('scraping_mode', 'html')),
            scraping_hints=source_data.get('scraping_hints'),
        )

        try:
            # Run scraping pipeline
            with ScrapingPipeline(client, existing_hashes=existing_hashes) as pipeline:
                result, events = pipeline.run(source)

            # Update source
            db.update_source(
                source.id,
                target_url=source.target_url,
                status=source.status.value,
                last_scraped=datetime.utcnow().isoformat(),
                last_error=result.error_message,
            )

            # Save events to database
            for event in events:
                event_dict = {
                    'id': event.id,
                    'source_id': event.source_id,
                    'title': event.title,
                    'description': event.description,
                    'date_start': event.date_start.isoformat(),
                    'date_end': event.date_end.isoformat() if event.date_end else None,
                    'location_name': event.location.name,
                    'location_address': event.location.address,
                    'location_district': event.location.district,
                    'location_lat': event.location.lat,
                    'location_lng': event.location.lng,
                    'category': event.category.value,
                    'is_indoor': event.is_indoor,
                    'age_suitability': event.age_suitability,
                    'price_info': event.price_info,
                    'original_link': event.original_link,
                    'region': event.region,
                }
                db.upsert_event(event_dict)

                # Add hash to existing for next source
                if event.id not in existing_hashes:
                    existing_hashes.append(event.id)

            # Update statistics
            total_events_found += result.events_found
            total_events_new += result.events_new

            if result.success:
                successful += 1
                print(f"    ✓ Success: {result.events_found} found, {result.events_new} new")
            else:
                failed += 1
                print(f"    ✗ Failed: {result.error_message}")

        except Exception as e:
            failed += 1
            print(f"    ✗ Exception: {e}")
            db.update_source(
                source.id,
                status='error',
                last_error=str(e),
            )

    # Summary
    print(f"\n{'='*60}")
    print(f"[scrape_all] Complete!")
    print(f"    Sources: {successful} successful, {failed} failed")
    print(f"    Events: {total_events_found} found, {total_events_new} new")
    print(f"    Finished at {datetime.now().isoformat()}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    scrape_all_sources()
