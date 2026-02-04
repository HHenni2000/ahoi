"""
Manual Test Script for ahoi Scraper

Run this script to test the scraping pipeline with real URLs.

Usage:
    1. Copy .env.example to .env and add your OpenAI API key
    2. Run: python test_scraper.py

You can modify the TEST_SOURCES list below to test different websites.
"""

import os
import json
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI

from scraper.models import Source
from scraper.pipeline import ScrapingPipeline

# Load environment variables
load_dotenv()

# ============================================================================
# TEST SOURCES - Add your test URLs here
# ============================================================================

TEST_SOURCES = [
    {
        "name": "Bücherhallen Hamburg",
        "input_url": "https://www.buecherhallen.de/",
    },
    {
        "name": "Kindaling Hamburg",
        "input_url": "https://www.kindaling.de/veranstaltungen/hamburg",
    },
    {
        "name": "Kindertheater Wackelzahn",
        "input_url": "https://www.norddeutsches-tourneetheater.de/",
    },
    {
        "name": "Museum für Kunst und Gewerbe",
        "input_url": "https://www.mkg-hamburg.de/",
    },
    {
        "name": "Altonaer Museum",
        "input_url": "https://www.shmh.de/altonaer-museum",
    },
    {
        "name": "Fundus Theater",
        "input_url": "https://www.fundus-theater.de/",
    },
    {
        "name": "Tierpark Hagenbeck",
        "input_url": "https://www.hagenbeck.de/",
    },
]

# ============================================================================


def main():
    """Run the scraper test."""
    
    # Check for API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "sk-your-api-key-here":
        print("=" * 60)
        print("ERROR: OpenAI API key not configured!")
        print()
        print("Please:")
        print("1. Copy .env.example to .env")
        print("2. Add your OpenAI API key to the .env file")
        print("=" * 60)
        return
    
    # Initialize OpenAI client
    client = OpenAI(api_key=api_key)
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    print("=" * 60)
    print("ahoi Scraper Test")
    print(f"Model: {model}")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 60)
    print()
    
    # Initialize pipeline
    pipeline = ScrapingPipeline(openai_client=client, model=model)

    # Track results
    all_results = []
    total_events = []
    total_tokens = 0

    # Process each source
    for i, source_data in enumerate(TEST_SOURCES, 1):
        if source_data["input_url"] == "https://example.com":
            print(f"[{i}] Skipping placeholder URL: {source_data['name']}")
            print("    -> Please add real URLs to TEST_SOURCES in test_scraper.py")
            print()
            continue
        
        print(f"[{i}] Processing: {source_data['name']}")
        print(f"    URL: {source_data['input_url']}")
        print()
        
        # Create source object
        source = Source(
            id=f"test-{i}",
            name=source_data["name"],
            input_url=source_data["input_url"],
        )
        
        # Run pipeline
        result, events = pipeline.run(source)
        
        all_results.append({
            "source": source_data["name"],
            "result": result,
            "events_count": len(events),
        })
        total_events.extend(events)
        total_tokens += result.tokens_used
        
        # Print results
        print(f"    Status: {'SUCCESS' if result.success else 'FAILED'}")
        print(f"    Target URL: {source.target_url}")
        print(f"    Events found: {result.events_found}")
        print(f"    New events: {result.events_new}")
        print(f"    Tokens used: {result.tokens_used}")
        print(f"    Duration: {result.duration_seconds:.2f}s")
        
        if result.error_message:
            print(f"    Error: {result.error_message}")
        
        print()
        
        # Print extracted events
        if events:
            print("    Extracted events:")
            for j, event in enumerate(events, 1):
                print(f"    [{j}] {event.title}")
                print(f"        Date: {event.date_start.strftime('%d.%m.%Y %H:%M')}")
                print(f"        Location: {event.location.name}")
                print(f"        Category: {event.category.value}")
                print(f"        Price: {event.price_info}")
                print(f"        Age: {event.age_suitability}")
                print()
        
        print("-" * 60)
        print()
    
    # Summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Sources tested: {len(all_results)}")
    print(f"Total events found: {len(total_events)}")
    print(f"Total tokens used: {total_tokens}")
    
    # Estimate cost (gpt-4o-mini pricing as of 2024)
    # Input: $0.15/1M tokens, Output: $0.60/1M tokens
    # Rough estimate assuming 70% input, 30% output
    estimated_cost = (total_tokens * 0.7 * 0.00015) + (total_tokens * 0.3 * 0.0006)
    print(f"Estimated cost: ${estimated_cost:.4f}")
    print()
    
    # Save results to JSON for review
    output_file = "test_results.json"
    output_data = {
        "timestamp": datetime.now().isoformat(),
        "model": model,
        "total_tokens": total_tokens,
        "events": [event.model_dump() for event in total_events],
    }
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False, default=str)

    print(f"Results saved to: {output_file}")

    # Cleanup (closes Playwright browser if used)
    pipeline.close()


if __name__ == "__main__":
    main()
