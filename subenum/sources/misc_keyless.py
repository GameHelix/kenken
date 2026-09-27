"""A cluster of small keyless sources that each need only a few lines."""
from __future__ import annotations

from ..core import Source, SourceError, extract_hosts


class SubdomainCenter(Source):
    name = "subdomaincenter"
    description = "api.subdomain.center aggregated subdomains"

    def enumerate(self, domain):
        data = self.http.get_json(
            "https://api.subdomain.center/", params={"domain": domain}, timeout=60
        )
        if isinstance(data, list):
            for name in data:
                name = str(name)
                # subdomain.center renders certificate wildcards '*.x' as 'wildcard.x'
                if name.startswith("wildcard."):
                    name = "*." + name[len("wildcard."):]
                yield name


class Columbus(Source):
    name = "columbus"
    description = "Columbus Project (columbus.elmasy.com) subdomains"
    default_enabled = False  # columbus.elmasy.com no longer resolves (2026)

    def enumerate(self, domain):
        data = self.http.get_json(
            f"https://columbus.elmasy.com/api/lookup/{domain}",
            headers={"Accept": "application/json"},
            timeout=45,
        )
        if isinstance(data, list):
            for label in data:
                # Columbus returns labels only (e.g. "www"), or full names.
                label = str(label)
                yield label if label.endswith(domain) else f"{label}.{domain}"


class ShrewdEye(Source):
    name = "shrewdeye"
    description = "shrewdeye.app aggregated subdomain list"
    default_enabled = False  # shrewdeye.app no longer resolves (2026)

    def enumerate(self, domain):
        try:
            text = self.http.get_text(f"https://shrewdeye.app/domains/{domain}.txt", timeout=45)
        except SourceError:
            return
        for line in text.splitlines():
            if line.strip():
                yield line.strip()


class Digitorus(Source):
    name = "digitorus"
    description = "certificatedetails.com (Digitorus) certificate hostnames"
    default_enabled = False  # certificatedetails.com returns 403 to scripted clients (2026)

    def enumerate(self, domain):
        text = self.http.get_text(f"https://certificatedetails.com/{domain}", timeout=60)
        yield from extract_hosts(text, domain)


class HudsonRock(Source):
    name = "hudsonrock"
    description = "HudsonRock Cavalier infostealer-derived URLs"

    def enumerate(self, domain):
        try:
            data = self.http.get_json(
                "https://cavalier.hudsonrock.com/api/json/v2/osint-tools/urls-by-domain",
                params={"domain": domain},
                timeout=60,
            )
        except SourceError:
            return
        blob = str(data)
        yield from extract_hosts(blob, domain)


class ThreatMiner(Source):
    name = "threatminer"
    description = "ThreatMiner passive DNS subdomains"
    default_enabled = False  # frequently slow/unavailable

    def enumerate(self, domain):
        data = self.http.get_json(
            "https://api.threatminer.org/v2/domain.php",
            params={"q": domain, "rt": 5},
            timeout=45,
        )
        if str(data.get("status_code")) != "200":
            return
        for name in data.get("results", []) or []:
            yield name
