"""SSLMate Cert Spotter - Certificate Transparency issuances. Keyless (small quota)
or higher quota with CERTSPOTTER_API_KEY."""
from __future__ import annotations

import time

from ..core import Source, SourceError


class CertSpotter(Source):
    name = "certspotter"
    description = "Certificate Transparency issuances via SSLMate Cert Spotter"

    def enumerate(self, domain):
        headers = {}
        token = self.ctx.key("CERTSPOTTER_API_KEY")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        after = ""
        pages = 0
        while pages < 50:
            pages += 1
            params = {
                "domain": domain,
                "include_subdomains": "true",
                "expand": "dns_names",
                "match_wildcards": "true",
            }
            if after:
                params["after"] = after
            resp = self.http.request(
                "https://api.certspotter.com/v1/issuances",
                params=params,
                headers=headers,
                timeout=60,
                ok=(200,),
            )
            rows = resp.json()
            if not rows:
                return
            for row in rows:
                for name in row.get("dns_names", []) or []:
                    yield name
                after = str(row.get("id") or after)
            if len(rows) < 100:  # last page
                return
            time.sleep(0.5)
        raise SourceError("stopped after 50 pages (quota/pagination guard)")
