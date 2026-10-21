"""File ingestion into the Bronze layer."""

from forja_core.ingestion.detection import decode_text, detect_delimiter, detect_format
from forja_core.ingestion.service import IngestionService

__all__ = ["IngestionService", "decode_text", "detect_delimiter", "detect_format"]
