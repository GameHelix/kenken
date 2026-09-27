"""RapidDNS.io - scrapes the subdomain HTML table. Keyless."""
from __future__ import annotations

from ..core import Source, extract_hosts


class RapidDNS(Source):
    name = "rapiddns"
    description = "RapidDNS.io subdomain records (HTML scrape)"

    def enumerate(self, domain):
        text = self.http.get_text(
            f"https://rapiddns.io/subdomain/{domain}",
            params={"full": "1"},
            timeout=60,
        )
        yield from extract_hosts(text, domain)
