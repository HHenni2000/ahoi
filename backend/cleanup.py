#!/usr/bin/env python3
"""
Cleanup Old Events

Cron script to delete events that have already passed.
Run via cron: 0 4 * * * /opt/ahoi/venv/bin/python /opt/ahoi/backend/cleanup.py
"""

import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

import database as db

# Load environment variables
load_dotenv()

# Days to keep past events (negative = delete events older than X days ago)
DAYS_TO_KEEP = 7


def cleanup_old_events():
    """Delete events that have passed more than DAYS_TO_KEEP days ago."""
    print(f"\n{'='*60}")
    print(f"[cleanup] Starting at {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    # Initialize database
    db.init_db()

    # Count events before
    count_before = db.get_events_count()
    print(f"[cleanup] Events in database: {count_before}")

    # Delete old events
    deleted = db.delete_old_events(days=DAYS_TO_KEEP)
    print(f"[cleanup] Deleted {deleted} events older than {DAYS_TO_KEEP} days")

    # Count events after
    count_after = db.get_events_count()
    print(f"[cleanup] Events remaining: {count_after}")

    print(f"\n[cleanup] Complete at {datetime.now().isoformat()}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    cleanup_old_events()
