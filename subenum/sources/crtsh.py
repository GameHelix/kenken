"""crt.sh - Certificate Transparency log search (Sectigo). No key required."""
from __future__ import annotations

import time

from ..core import Source, SourceError


class CrtSh(Source):
    name = "crtsh"
    description = "Certificate Transparency logs via crt.sh JSON API"

    def enumerate(self, domain):
        # crt.sh is overloaded: it intermittently times out or answers 404/502/503
        # for queries that succeed seconds later, so retry with backoff.
        # `exclude=expired` is NOT used: expired certs still reveal hostnames.
        # The crtshdb source queries the same data through crt.sh's database.
        last_err = None
        for attempt in range(5):
            query = f"%.{domain}" if attempt % 2 == 0 else domain
            try:
                rows = self.http.get_json(
                    "https://crt.sh/",
                    params={"q": query, "output": "json"},
                    timeout=60,
                    retries=0,
                    ok=(200,),
                )
            except SourceError as e:
                last_err = e
                time.sleep(3 * (attempt + 1))
                continue
            for row in rows or []:
                for field in ("name_value", "common_name"):
                    for name in str(row.get(field) or "").split("\n"):
                        yield name
            return
        raise last_err
