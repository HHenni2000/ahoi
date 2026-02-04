"""
ahoi - Firebase Cloud Functions

Cloud Functions for the ahoi family event aggregator.
Handles scraping, source management, and scheduled updates.
"""

import os
from datetime import datetime, timedelta
from typing import Any

from firebase_functions import https_fn, scheduler_fn, options
from firebase_admin import initialize_app, firestore
from openai import OpenAI

# Initialize Firebase
initialize_app()


def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from environment/secrets."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")
    return OpenAI(api_key=api_key)


def get_db():
    """Get Firestore client."""
    return firestore.client()


# =============================================================================
# HTTP Functions
# =============================================================================


@https_fn.on_request(
    cors=options.CorsOptions(cors_origins="*", cors_methods=["GET", "POST"]),
    memory=options.MemoryOption.MB_512,
    timeout_sec=300,
)
def add_source(req: https_fn.Request) -> https_fn.Response:
    """
    Add a new source and discover its calendar URL.

    Request body:
    {
        "name": "Theater Name",
        "inputUrl": "https://example.com",
        "region": "hamburg"
    }
    """
    from scraper.models import Source, SourceStatus
    from scraper.navigator import Navigator

    if req.method != "POST":
        return https_fn.Response("Method not allowed", status=405)

    try:
        data = req.get_json()
        name = data.get("name")
        input_url = data.get("inputUrl")
        region = data.get("region", "hamburg")

        if not name or not input_url:
            return https_fn.Response(
                '{"error": "name and inputUrl are required"}',
                status=400,
                content_type="application/json"
            )

        # Create source
        source = Source(
            name=name,
            input_url=input_url,
            region=region,
            status=SourceStatus.PENDING,
        )

        # Discover calendar URL
        client = get_openai_client()
        navigator = Navigator(openai_client=client)

        try:
            target_url = navigator.discover(source)
            source.target_url = target_url
            source.status = SourceStatus.ACTIVE if target_url else SourceStatus.ERROR
        finally:
            navigator.close()

        # Save to Firestore
        db = get_db()
        doc_ref = db.collection("sources").document()
        source.id = doc_ref.id

        doc_ref.set({
            "id": source.id,
            "name": source.name,
            "inputUrl": source.input_url,
            "targetUrl": source.target_url,
            "isActive": source.is_active,
            "status": source.status.value,
            "lastScraped": None,
            "lastError": source.last_error,
            "strategy": source.strategy.value,
            "region": source.region,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })

        return https_fn.Response(
            f'{{"id": "{source.id}", "targetUrl": "{source.target_url}", "status": "{source.status.value}"}}',
            status=201,
            content_type="application/json"
        )

    except Exception as e:
        return https_fn.Response(
            f'{{"error": "{str(e)}"}}',
            status=500,
            content_type="application/json"
        )


@https_fn.on_request(
    cors=options.CorsOptions(cors_origins="*", cors_methods=["GET", "POST"]),
    memory=options.MemoryOption.GB_1,
    timeout_sec=540,
)
def scrape_source(req: https_fn.Request) -> https_fn.Response:
    """
    Scrape a single source by ID.

    Request body:
    {
        "sourceId": "abc123"
    }
    """
    from scraper.models import Source, SourceStatus, ScrapingStrategy
    from scraper.pipeline import ScrapingPipeline

    if req.method != "POST":
        return https_fn.Response("Method not allowed", status=405)

    try:
        data = req.get_json()
        source_id = data.get("sourceId")

        if not source_id:
            return https_fn.Response(
                '{"error": "sourceId is required"}',
                status=400,
                content_type="application/json"
            )

        # Get source from Firestore
        db = get_db()
        doc = db.collection("sources").document(source_id).get()

        if not doc.exists:
            return https_fn.Response(
                '{"error": "Source not found"}',
                status=404,
                content_type="application/json"
            )

        doc_data = doc.to_dict()

        source = Source(
            id=source_id,
            name=doc_data.get("name", ""),
            input_url=doc_data.get("inputUrl", ""),
            target_url=doc_data.get("targetUrl"),
            is_active=doc_data.get("isActive", True),
            status=SourceStatus(doc_data.get("status", "pending")),
            strategy=ScrapingStrategy(doc_data.get("strategy", "weekly")),
            region=doc_data.get("region", "hamburg"),
        )

        # Get existing event hashes for deduplication
        existing_hashes = []
        events_query = db.collection("events").where("sourceId", "==", source_id).stream()
        for event_doc in events_query:
            existing_hashes.append(event_doc.id)

        # Run scraping pipeline
        client = get_openai_client()
        pipeline = ScrapingPipeline(
            openai_client=client,
            existing_hashes=existing_hashes,
        )

        try:
            result, new_events = pipeline.run(source, skip_navigation=bool(source.target_url))
        finally:
            pipeline.close()

        # Save new events to Firestore
        batch = db.batch()

        for event in new_events:
            event_ref = db.collection("events").document(event.id)
            batch.set(event_ref, {
                "id": event.id,
                "sourceId": source_id,
                "title": event.title,
                "description": event.description,
                "dateStart": event.date_start,
                "dateEnd": event.date_end,
                "location": {
                    "name": event.location.name,
                    "address": event.location.address,
                    "district": event.location.district,
                    "lat": event.location.lat,
                    "lng": event.location.lng,
                },
                "category": event.category.value,
                "isIndoor": event.is_indoor,
                "ageSuitability": event.age_suitability,
                "priceInfo": event.price_info,
                "originalLink": event.original_link,
                "region": event.region,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })

        # Update source
        source_ref = db.collection("sources").document(source_id)
        batch.update(source_ref, {
            "targetUrl": source.target_url,
            "status": source.status.value,
            "lastScraped": firestore.SERVER_TIMESTAMP,
            "lastError": result.error_message,
        })

        batch.commit()

        return https_fn.Response(
            f'{{"success": {str(result.success).lower()}, "eventsFound": {result.events_found}, "eventsNew": {result.events_new}, "tokensUsed": {result.tokens_used}}}',
            status=200,
            content_type="application/json"
        )

    except Exception as e:
        return https_fn.Response(
            f'{{"error": "{str(e)}"}}',
            status=500,
            content_type="application/json"
        )


# =============================================================================
# Scheduled Functions
# =============================================================================


@scheduler_fn.on_schedule(
    schedule="every sunday 02:00",
    timezone=scheduler_fn.Timezone("Europe/Berlin"),
    memory=options.MemoryOption.GB_1,
    timeout_sec=540,
)
def scrape_all_weekly(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Scrape all active sources with weekly strategy.
    Runs every Sunday at 2 AM.
    """
    from scraper.models import Source, SourceStatus, ScrapingStrategy
    from scraper.pipeline import ScrapingPipeline

    db = get_db()

    # Get all active weekly sources
    sources_query = (
        db.collection("sources")
        .where("isActive", "==", True)
        .where("strategy", "==", "weekly")
        .stream()
    )

    client = get_openai_client()

    for doc in sources_query:
        doc_data = doc.to_dict()
        source_id = doc.id

        print(f"[Scheduler] Scraping source: {doc_data.get('name')}")

        source = Source(
            id=source_id,
            name=doc_data.get("name", ""),
            input_url=doc_data.get("inputUrl", ""),
            target_url=doc_data.get("targetUrl"),
            is_active=True,
            status=SourceStatus(doc_data.get("status", "active")),
            strategy=ScrapingStrategy.WEEKLY,
            region=doc_data.get("region", "hamburg"),
        )

        # Get existing hashes
        existing_hashes = []
        events_query = db.collection("events").where("sourceId", "==", source_id).stream()
        for event_doc in events_query:
            existing_hashes.append(event_doc.id)

        # Run pipeline
        pipeline = ScrapingPipeline(
            openai_client=client,
            existing_hashes=existing_hashes,
        )

        try:
            result, new_events = pipeline.run(source, skip_navigation=bool(source.target_url))

            # Save events
            batch = db.batch()

            for event in new_events:
                event_ref = db.collection("events").document(event.id)
                batch.set(event_ref, {
                    "id": event.id,
                    "sourceId": source_id,
                    "title": event.title,
                    "description": event.description,
                    "dateStart": event.date_start,
                    "dateEnd": event.date_end,
                    "location": {
                        "name": event.location.name,
                        "address": event.location.address,
                        "district": event.location.district,
                        "lat": event.location.lat,
                        "lng": event.location.lng,
                    },
                    "category": event.category.value,
                    "isIndoor": event.is_indoor,
                    "ageSuitability": event.age_suitability,
                    "priceInfo": event.price_info,
                    "originalLink": event.original_link,
                    "region": event.region,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                })

            # Update source
            source_ref = db.collection("sources").document(source_id)
            batch.update(source_ref, {
                "status": source.status.value,
                "lastScraped": firestore.SERVER_TIMESTAMP,
                "lastError": result.error_message,
            })

            batch.commit()

            print(f"[Scheduler] Completed {source.name}: {result.events_new} new events")

        except Exception as e:
            print(f"[Scheduler] Error scraping {source.name}: {e}")
            db.collection("sources").document(source_id).update({
                "status": "error",
                "lastError": str(e),
            })

        finally:
            pipeline.close()


@scheduler_fn.on_schedule(
    schedule="every day 06:00",
    timezone=scheduler_fn.Timezone("Europe/Berlin"),
    memory=options.MemoryOption.MB_256,
    timeout_sec=120,
)
def cleanup_old_events(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Remove events that are more than 7 days in the past.
    Runs every day at 6 AM.
    """
    db = get_db()
    cutoff_date = datetime.now() - timedelta(days=7)

    # Query old events
    old_events = (
        db.collection("events")
        .where("dateStart", "<", cutoff_date)
        .stream()
    )

    # Delete in batches
    batch = db.batch()
    count = 0

    for doc in old_events:
        batch.delete(doc.reference)
        count += 1

        if count >= 500:  # Firestore batch limit
            batch.commit()
            batch = db.batch()
            count = 0

    if count > 0:
        batch.commit()

    print(f"[Cleanup] Deleted {count} old events")
