"""
Direct test of vision_scraper module
"""
import os
from dotenv import load_dotenv
from openai import OpenAI
from scraper.vision_scraper import extract_events_with_vision

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

print("Testing vision scraper directly...")
print("URL: https://allee-theater.de/spielplan")
print("This will take ~30 seconds and cost ~$0.01-0.02\n")

try:
    events = extract_events_with_vision(
        client=client,
        url="https://allee-theater.de/spielplan",
        source_id="test-source",
        region="hamburg",
        scraping_hints="Theater-Spielplan mit mehreren Events",
    )

    print(f"\n[OK] Vision scraper returned {len(events)} events")

    for i, event in enumerate(events[:5], 1):
        print(f"\n{i}. {event.title}")
        print(f"   Date: {event.date_start}")
        print(f"   Location: {event.location.name}")
        print(f"   Category: {event.category.value}")

except Exception as e:
    print(f"\n[ERROR] Vision scraper failed: {e}")
    import traceback
    traceback.print_exc()
