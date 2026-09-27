"""AlienVault OTX passive DNS + URL list. Keyless; optional OTX_API_KEY."""
from __future__ import annotations

from ..core import Source, extract_hosts


class AlienVault(Source):
    name = "alienvault"
    description = "AlienVault OTX passive DNS and URL list"

    def _headers(self):
        key = self.ctx.key("OTX_API_KEY")
        return {"X-OTX-API-KEY": key} if key else {}

    def enumerate(self, domain):
        base = f"https://otx.alienvault.com/api/v1/indicators/domain/{domain}"
        headers = self._headers()

        # Passive DNS
        try:
            data = self.http.get_json(f"{base}/passive_dns", headers=headers, timeout=60)
            for row in data.get("passive_dns", []) or []:
                name = row.get("hostname") or row.get("record")
                if name:
                    yield name
        except Exception:
            pass

        # URL list (paginated)
        for page in range(1, 51):
            try:
                data = self.http.get_json(
                    f"{base}/url_list",
                    params={"limit": 500, "page": page},
                    headers=headers,
                    timeout=60,
                )
            except Exception:
                break
            urls = data.get("url_list", []) or []
            for row in urls:
                u = row.get("hostname") or row.get("url") or ""
                for h in extract_hosts(u, domain):
                    yield h
            if not data.get("has_next") or not urls:
                break
