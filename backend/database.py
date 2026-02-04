"""
Database module for ahoi Backend

SQLite database connection and schema management.
"""

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

# Database path (relative to backend folder, can be overridden via env)
DEFAULT_DB_PATH = Path(__file__).parent / "data" / "ahoi.db"


def get_db_path() -> Path:
    """Get database path, creating data directory if needed."""
    import os
    db_path = Path(os.getenv("DATABASE_PATH", str(DEFAULT_DB_PATH)))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


def init_db(db_path: Optional[Path] = None) -> None:
    """Initialize database with schema."""
    if db_path is None:
        db_path = get_db_path()

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Sources table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            input_url TEXT NOT NULL,
            target_url TEXT,
            is_active INTEGER DEFAULT 1,
            status TEXT DEFAULT 'pending',
            last_scraped TEXT,
            last_error TEXT,
            strategy TEXT DEFAULT 'weekly',
            region TEXT DEFAULT 'hamburg',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Events table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            source_id TEXT REFERENCES sources(id),
            title TEXT NOT NULL,
            description TEXT,
            date_start TEXT NOT NULL,
            date_end TEXT,
            location_name TEXT,
            location_address TEXT,
            location_district TEXT,
            location_lat REAL,
            location_lng REAL,
            category TEXT,
            is_indoor INTEGER,
            age_suitability TEXT,
            price_info TEXT,
            original_link TEXT,
            region TEXT DEFAULT 'hamburg',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Indexes for fast queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_events_region_date
        ON events(region, date_start)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_events_category
        ON events(region, category, date_start)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_events_source
        ON events(source_id)
    """)

    conn.commit()
    conn.close()
    print(f"[Database] Initialized at {db_path}")


@contextmanager
def get_connection(db_path: Optional[Path] = None):
    """Get database connection as context manager."""
    if db_path is None:
        db_path = get_db_path()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ============ Source Operations ============

def create_source(
    name: str,
    input_url: str,
    region: str = "hamburg",
    strategy: str = "weekly",
) -> dict:
    """Create a new source."""
    import uuid
    source_id = str(uuid.uuid4())

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sources (id, name, input_url, region, strategy)
            VALUES (?, ?, ?, ?, ?)
        """, (source_id, name, input_url, region, strategy))
        conn.commit()

    return get_source(source_id)


def get_source(source_id: str) -> Optional[dict]:
    """Get source by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sources WHERE id = ?", (source_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_all_sources(active_only: bool = False) -> list[dict]:
    """Get all sources."""
    with get_connection() as conn:
        cursor = conn.cursor()
        if active_only:
            cursor.execute("SELECT * FROM sources WHERE is_active = 1 ORDER BY name")
        else:
            cursor.execute("SELECT * FROM sources ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]


def update_source(source_id: str, **kwargs) -> Optional[dict]:
    """Update source fields."""
    allowed_fields = {
        'name', 'input_url', 'target_url', 'is_active', 'status',
        'last_scraped', 'last_error', 'strategy', 'region'
    }

    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    if not updates:
        return get_source(source_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values()) + [source_id]

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE sources SET {set_clause} WHERE id = ?", values)
        conn.commit()

    return get_source(source_id)


def delete_source(source_id: str) -> bool:
    """Delete a source and its events."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM events WHERE source_id = ?", (source_id,))
        cursor.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        conn.commit()
        return cursor.rowcount > 0


# ============ Event Operations ============

def upsert_event(event: dict) -> dict:
    """Insert or update an event."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Check if event exists
        cursor.execute("SELECT id FROM events WHERE id = ?", (event['id'],))
        exists = cursor.fetchone() is not None

        if exists:
            cursor.execute("""
                UPDATE events SET
                    source_id = ?, title = ?, description = ?,
                    date_start = ?, date_end = ?,
                    location_name = ?, location_address = ?, location_district = ?,
                    location_lat = ?, location_lng = ?,
                    category = ?, is_indoor = ?, age_suitability = ?,
                    price_info = ?, original_link = ?, region = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                event.get('source_id'),
                event['title'],
                event.get('description'),
                event['date_start'],
                event.get('date_end'),
                event.get('location_name'),
                event.get('location_address'),
                event.get('location_district'),
                event.get('location_lat'),
                event.get('location_lng'),
                event.get('category'),
                1 if event.get('is_indoor') else 0,
                event.get('age_suitability'),
                event.get('price_info'),
                event.get('original_link'),
                event.get('region', 'hamburg'),
                datetime.utcnow().isoformat(),
                event['id'],
            ))
        else:
            cursor.execute("""
                INSERT INTO events (
                    id, source_id, title, description,
                    date_start, date_end,
                    location_name, location_address, location_district,
                    location_lat, location_lng,
                    category, is_indoor, age_suitability,
                    price_info, original_link, region
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event['id'],
                event.get('source_id'),
                event['title'],
                event.get('description'),
                event['date_start'],
                event.get('date_end'),
                event.get('location_name'),
                event.get('location_address'),
                event.get('location_district'),
                event.get('location_lat'),
                event.get('location_lng'),
                event.get('category'),
                1 if event.get('is_indoor') else 0,
                event.get('age_suitability'),
                event.get('price_info'),
                event.get('original_link'),
                event.get('region', 'hamburg'),
            ))

        conn.commit()

    return get_event(event['id'])


def get_event(event_id: str) -> Optional[dict]:
    """Get event by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_events(
    region: str = "hamburg",
    category: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    is_indoor: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Get events with filters."""
    query = "SELECT * FROM events WHERE region = ?"
    params = [region]

    if category:
        query += " AND category = ?"
        params.append(category)

    if from_date:
        query += " AND date_start >= ?"
        params.append(from_date)

    if to_date:
        query += " AND date_start <= ?"
        params.append(to_date)

    if is_indoor is not None:
        query += " AND is_indoor = ?"
        params.append(1 if is_indoor else 0)

    query += " ORDER BY date_start ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def get_event_hashes(source_id: Optional[str] = None) -> list[str]:
    """Get all event hashes (for deduplication)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        if source_id:
            cursor.execute("SELECT id FROM events WHERE source_id = ?", (source_id,))
        else:
            cursor.execute("SELECT id FROM events")
        return [row['id'] for row in cursor.fetchall()]


def delete_old_events(days: int = 30) -> int:
    """Delete events older than N days."""
    from datetime import timedelta
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM events WHERE date_start < ?", (cutoff,))
        conn.commit()
        return cursor.rowcount


def get_events_count(region: str = "hamburg") -> int:
    """Get total event count."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM events WHERE region = ?", (region,))
        return cursor.fetchone()['count']


# Initialize on import (creates tables if needed)
if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
