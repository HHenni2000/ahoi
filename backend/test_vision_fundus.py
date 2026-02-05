"""
Test vision scraper with Fundus Theater (known to have children's events)
"""
import os
from dotenv import load_dotenv
from openai import OpenAI
from scraper.vision_scraper import extract_events_with_vision

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

print("Testing vision scraper with Fundus Theater...")
print("URL: https://fundus-theater.de/spielplan/")
print("This theater has children's events\n")

try:
    events = extract_events_with_vision(
        client=client,
        url="https://fundus-theater.de/spielplan/",
        source_id="test-fundus",
        region="hamburg",
        scraping_hints="Kinder- und Jugendtheater mit Events für verschiedene Altersgruppen",
    )

    print(f"\n[OK] Vision scraper returned {len(events)} events")

    for i, event in enumerate(events[:10], 1):
        print(f"\n{i}. {event.title}")
        print(f"   Date: {event.date_start}")
        print(f"   Age: {event.age_suitability}")
        print(f"   Category: {event.category.value}")

except Exception as e:
    print(f"\n[ERROR] Vision scraper failed: {e}")
    import traceback
    traceback.print_exc()
