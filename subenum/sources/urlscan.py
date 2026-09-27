"""urlscan.io search. Keyless (rate limited); optional URLSCAN_API_KEY raises limits."""
from __future__ import annotations

import time

from ..core import Source, SourceError, extract_hosts


class UrlScan(Source):
    name = "urlscan"
    description = "urlscan.io scan results search"

    def enumerate(self, domain):
        headers = {}
        key = self.ctx.key("URLSCAN_API_KEY")
        if key:
            headers["API-Key"] = key
        search_after = None
        pages = 0
        while pages < 20:
            pages += 1
            params = {"q": f"domain:{domain}", "size": 1000}
            if search_after:
                params["search_after"] = search_after
            try:
                data = self.http.get_json(
                    "https://urlscan.io/api/v1/search/",
                    params=params,
                    headers=headers,
                    timeout=60,
                )
            except SourceError as e:
                if pages == 1:
                    raise
                return  # partial pages already yielded
            results = data.get("results", []) or []
            if not results:
                return
            for row in results:
                page = row.get("page", {}) or {}
                task = row.get("task", {}) or {}
                for val in (page.get("domain"), page.get("url"), task.get("domain"), task.get("url")):
                    if val:
                        yield from extract_hosts(str(val), domain)
                sort = row.get("sort")
                if sort:
                    search_after = ",".join(str(x) for x in sort)
            if not data.get("has_more"):
                return
            time.sleep(1.0)
