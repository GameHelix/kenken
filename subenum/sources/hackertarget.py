"""HackerTarget hostsearch - free passive DNS (CSV host,ip). Small daily quota."""
from __future__ import annotations

from ..core import Source, SourceError


class HackerTarget(Source):
    name = "hackertarget"
    description = "HackerTarget hostsearch passive DNS (free quota)"

    def enumerate(self, domain):
        params = {"q": domain}
        apikey = self.ctx.key("HACKERTARGET_API_KEY")
        if apikey:
            params["apikey"] = apikey
        text = self.http.get_text(
            "https://api.hackertarget.com/hostsearch/",
            params=params,
            timeout=45,
        )
        low = text.lower()
        if "api count exceeded" in low or "api limit" in low:
            raise SourceError("HackerTarget quota exceeded")
        if low.startswith("error") or "no records" in low:
            return
        for line in text.splitlines():
            host = line.split(",", 1)[0].strip()
            if host:
                yield host
