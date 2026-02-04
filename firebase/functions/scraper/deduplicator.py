"""
Deduplication Module

Stage 3 of the scraping pipeline: Generate unique hashes for events
and detect duplicates.

Hash formula: md5(lowercase(title) + date + location_name)
"""

import hashlib
from typing import Optional

from .models import Event


class Deduplicator:
    """
    Handles event deduplication via content hashing.
    
    Generates unique IDs based on event title, date, and location
    to detect and prevent duplicate entries.
    """
    
    def __init__(self):
        """Initialize the Deduplicator."""
        self._seen_hashes: set[str] = set()
    
    def generate_hash(self, event: Event) -> str:
        """
        Generate a unique hash for an event.
        
        Hash is based on:
        - Lowercase title (normalized)
        - Start date (date only, not time)
        - Location name (lowercase)
        
        Args:
            event: The event to hash.
            
        Returns:
            MD5 hash string.
        """
        # Normalize components
        title_normalized = self._normalize_string(event.title)
        date_str = event.date_start.strftime("%Y-%m-%d")
        location_normalized = self._normalize_string(event.location.name)
        
        # Combine into hash input
        hash_input = f"{title_normalized}|{date_str}|{location_normalized}"
        
        # Generate MD5 hash
        hash_value = hashlib.md5(hash_input.encode("utf-8")).hexdigest()
        
        return hash_value
    
    def _normalize_string(self, s: str) -> str:
        """
        Normalize a string for consistent hashing.
        
        - Lowercase
        - Remove extra whitespace
        - Remove common punctuation
        """
        s = s.lower().strip()
        s = " ".join(s.split())  # Normalize whitespace
        
        # Remove common punctuation that might vary
        for char in [".", ",", "!", "?", ":", ";", "-", "–", "—", "'", '"']:
            s = s.replace(char, "")
        
        return s
    
    def is_duplicate(self, event: Event) -> bool:
        """
        Check if an event is a duplicate (already seen).
        
        Args:
            event: The event to check.
            
        Returns:
            True if duplicate, False if new.
        """
        hash_value = self.generate_hash(event)
        return hash_value in self._seen_hashes
    
    def mark_seen(self, event: Event) -> str:
        """
        Mark an event as seen and return its hash.
        
        Also sets the event's id field to the hash.
        
        Args:
            event: The event to mark.
            
        Returns:
            The event's hash.
        """
        hash_value = self.generate_hash(event)
        self._seen_hashes.add(hash_value)
        event.id = hash_value
        return hash_value
    
    def add_existing_hashes(self, hashes: list[str]) -> None:
        """
        Add existing hashes (e.g., from database) to the seen set.
        
        Use this when you want to check against events already in storage.
        
        Args:
            hashes: List of existing event hashes.
        """
        self._seen_hashes.update(hashes)
    
    def clear(self) -> None:
        """Clear all seen hashes."""
        self._seen_hashes.clear()
    
    def process_events(
        self, 
        events: list[Event], 
        existing_hashes: Optional[list[str]] = None
    ) -> tuple[list[Event], list[Event]]:
        """
        Process a list of events and separate new from duplicates.
        
        Args:
            events: List of events to process.
            existing_hashes: Optional list of hashes already in storage.
            
        Returns:
            Tuple of (new_events, duplicate_events).
        """
        if existing_hashes:
            self.add_existing_hashes(existing_hashes)
        
        new_events = []
        duplicate_events = []
        
        for event in events:
            if self.is_duplicate(event):
                duplicate_events.append(event)
            else:
                self.mark_seen(event)
                new_events.append(event)
        
        return new_events, duplicate_events
