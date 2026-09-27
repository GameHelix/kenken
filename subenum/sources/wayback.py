"""Wayback Machine CDX index. Keyless. Extracts hostnames from archived URLs."""
from __future__ import annotations

from ..core import Source, SourceError, extract_hosts


class Wayback(Source):
    name = "wayback"
    description = "Wayback Machine (web.archive.org) CDX archived URLs"

    def enumerate(self, domain):
        # collapse=urlkey dedups; fl=original returns just the URL column.
        text = self.http.get_text(
            "https://web.archive.org/cdx/search/cdx",
            params={
                "url": f"*.{domain}/*",
                "output": "text",
                "fl": "original",
                "collapse": "urlkey",
                "limit": 200000,
            },
            timeout=120,
        )
        if "temporarily offline" in text[:2000].lower() or "<html" in text[:200].lower():
            raise SourceError("Internet Archive returned an HTML error page (service unavailable)")
        seen: set[str] = set()
        for line in text.splitlines():
            for h in extract_hosts(line, domain):
                if h not in seen:
                    seen.add(h)
                    yield h
