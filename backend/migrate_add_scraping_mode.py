"""
Migration: Add scraping_mode, scraping_hints, and custom_selectors to sources table.

Run this once to update existing databases.
"""

import sqlite3
from pathlib import Path
from database import get_db_path


def migrate():
    """Add new columns to sources table."""
    db_path = get_db_path()

    if not db_path.exists():
        print("No database found. Run the app first to initialize.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if columns already exist
    cursor.execute("PRAGMA table_info(sources)")
    columns = [row[1] for row in cursor.fetchall()]

    changes_made = False

    # Add scraping_mode column
    if "scraping_mode" not in columns:
        print("Adding scraping_mode column...")
        cursor.execute("""
            ALTER TABLE sources
            ADD COLUMN scraping_mode TEXT DEFAULT 'html'
        """)
        changes_made = True

    # Add scraping_hints column
    if "scraping_hints" not in columns:
        print("Adding scraping_hints column...")
        cursor.execute("""
            ALTER TABLE sources
            ADD COLUMN scraping_hints TEXT
        """)
        changes_made = True

    # Add custom_selectors column
    if "custom_selectors" not in columns:
        print("Adding custom_selectors column...")
        cursor.execute("""
            ALTER TABLE sources
            ADD COLUMN custom_selectors TEXT
        """)
        changes_made = True

    if changes_made:
        conn.commit()
        print("[OK] Migration completed successfully!")
    else:
        print("[OK] All columns already exist. No migration needed.")

    conn.close()


if __name__ == "__main__":
    migrate()
