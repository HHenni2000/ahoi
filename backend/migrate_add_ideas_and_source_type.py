"""
Migration: add source_type to sources and create ideas table.

Run once for existing databases.
"""

import sqlite3

from database import get_db_path


def migrate():
    """Run schema migration."""
    db_path = get_db_path()
    if not db_path.exists():
        print("No database found. Run the app first to initialize.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(sources)")
    columns = [row[1] for row in cursor.fetchall()]

    if "source_type" not in columns:
        print("Adding source_type column to sources...")
        cursor.execute(
            """
            ALTER TABLE sources
            ADD COLUMN source_type TEXT DEFAULT 'event'
            """
        )
    else:
        print("source_type already exists on sources.")

    print("Ensuring ideas table exists...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY,
            source_id TEXT UNIQUE REFERENCES sources(id),
            title TEXT NOT NULL,
            description TEXT,
            location_name TEXT,
            location_address TEXT,
            location_district TEXT,
            location_lat REAL,
            location_lng REAL,
            category TEXT,
            is_indoor INTEGER,
            age_suitability TEXT,
            price_info TEXT,
            duration_minutes INTEGER,
            weather_tags TEXT,
            original_link TEXT,
            region TEXT DEFAULT 'hamburg',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ideas_region_category
        ON ideas(region, category)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ideas_source
        ON ideas(source_id)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ideas_region_district
        ON ideas(region, location_district)
        """
    )

    conn.commit()
    conn.close()
    print("[OK] Migration completed successfully!")


if __name__ == "__main__":
    migrate()
