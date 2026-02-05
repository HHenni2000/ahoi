"""
Quick test script for Vision Scraper
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8001"

# 1. Create a test source with vision mode
print("Creating test source with vision mode...")
response = requests.post(
    f"{BASE_URL}/api/sources",
    json={
        "name": "Allee Theater (Vision Test)",
        "input_url": "https://allee-theater.de/spielplan",
        "scraping_mode": "vision",
        "scraping_hints": "Theater-Spielplan mit mehreren Events in tabellarischer Form",
    }
)

if response.status_code != 200:
    print(f"Error creating source: {response.status_code}")
    print(response.text)
    exit(1)

source = response.json()
source_id = source["id"]
print(f"[OK] Source created: {source['name']} (ID: {source_id})")
print(f"  scraping_mode: {source.get('scraping_mode', 'NOT SET')}")
print(f"  scraping_hints: {source.get('scraping_hints', 'NOT SET')}")

# 2. Trigger scraping
print(f"\nTriggering scraping for source {source_id}...")
print("(This will take ~30 seconds with Vision mode...)")

response = requests.post(f"{BASE_URL}/api/sources/{source_id}/scrape")

if response.status_code != 200:
    print(f"Error scraping: {response.status_code}")
    print(response.text)
    exit(1)

result = response.json()
print("\n=== Scraping Result ===")
print(json.dumps(result, indent=2))

if result["success"]:
    print(f"\n[OK] Success! Found {result['events_found']} events, {result['events_new']} new")
    print(f"  Duration: {result['duration_seconds']:.1f}s")

    # 3. Fetch events
    print("\n=== Fetching Events ===")
    response = requests.get(f"{BASE_URL}/api/events?limit=5")
    events = response.json()

    for i, event in enumerate(events[:5], 1):
        print(f"\n{i}. {event['title']}")
        print(f"   Date: {event['date_start']}")
        print(f"   Location: {event['location_name']}")
        print(f"   Category: {event['category']}")
else:
    print(f"\n[FAIL] Scraping failed: {result.get('error_message')}")
