"""
Logging helpers for scraper modules.
"""

from __future__ import annotations

import logging
import os


def _resolve_level() -> str:
    env_level = os.getenv("LOG_LEVEL")
    if env_level:
        return env_level.upper()
    if os.getenv("SCRAPER_DEBUG", "0") == "1" or os.getenv("DEBUG", "0") == "1":
        return "DEBUG"
    return "INFO"


def get_logger(name: str) -> logging.Logger:
    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=_resolve_level(),
            format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        )
    return logging.getLogger(name)


def is_debug() -> bool:
    return _resolve_level() == "DEBUG"
