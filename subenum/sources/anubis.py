"""Anubis (jldc.me) subdomain database. Keyless JSON list."""
from __future__ import annotations

from ..core import Source, SourceError


class Anubis(Source):
    name = "anubis"
    description = "Anubis-DB subdomain list via jldc.me"
    default_enabled = False  # jldc.me now redirects to jonlu.ca and returns 403 (2026)

    def enumerate(self, domain):
        try:
            data = self.http.get_json(
                f"https://jldc.me/anubis/subdomains/{domain}", timeout=45
            )
        except SourceError:
            return  # 404 = no data for this domain
        if isinstance(data, list):
            for name in data:
                yield name
