"""Base adapter for scraping council member data."""

import abc
from datetime import date


class BaseAdapter(abc.ABC):
    """Abstract base class for jurisdiction scraper adapters."""

    def __init__(self, entry: dict):
        self.entry = entry
        self.id = entry["id"]
        self.url = entry.get("url", "")
        self.config = entry.get("adapterConfig", {})

    @abc.abstractmethod
    def fetch(self) -> str:
        """Fetch raw page content. Return HTML string."""

    @abc.abstractmethod
    def parse(self, html: str) -> list[dict]:
        """Parse HTML into raw member records."""

    def normalize(self, raw: list[dict]) -> list[dict]:
        """Map raw records to the unified schema.
        Subclasses may override for custom normalization.
        Default passes through with required metadata fields.
        """
        today = date.today().isoformat()
        for record in raw:
            record.setdefault("source", self.adapter_name())
            record.setdefault("lastUpdated", today)
        return raw

    def scrape(self) -> list[dict]:
        """Full pipeline: fetch -> parse -> normalize."""
        html = self.fetch()
        raw = self.parse(html)
        return self.normalize(raw)

    def adapter_name(self) -> str:
        """Return the adapter name for the source field."""
        return self.__class__.__name__.lower().replace("adapter", "")
