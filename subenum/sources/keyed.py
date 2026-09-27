"""API-key-gated sources. Each cleanly skips when its key is absent and raises a
one-line SourceError on API failure. Implemented from official API docs."""
from __future__ import annotations

import time

from ..core import Source, SourceError, extract_hosts


class VirusTotal(Source):
    name = "virustotal"
    description = "VirusTotal v3 subdomains relationship"
    requires_keys = ("VIRUSTOTAL_API_KEY",)
    default_enabled = False

    def enumerate(self, domain):
        headers = {"x-apikey": self.key("VIRUSTOTAL_API_KEY")}
        url = f"https://www.virustotal.com/api/v3/domains/{domain}/subdomains?limit=40"
        for _ in range(50):
            data = self.http.get_json(url, headers=headers, timeout=45)
            for row in data.get("data", []) or []:
                if row.get("id"):
                    yield row["id"]
            url = (data.get("links", {}) or {}).get("next")
            if not url:
                return
            time.sleep(1.0)


class SecurityTrails(Source):
    name = "securitytrails"
    description = "SecurityTrails subdomains API"
    requires_keys = ("SECURITYTRAILS_API_KEY",)
    default_enabled = False

    def enumerate(self, domain):
        data = self.http.get_json(
            f"https://api.securitytrails.com/v1/domain/{domain}/subdomains",
            params={"children_only": "false"},
            headers={"APIKEY": self.key("SECURITYTRAILS_API_KEY")},
            timeout=45,
        )
        for sub in data.get("subdomains", []) or []:
            yield f"{sub}.{domain}"


class Shodan(Source):
    name = "shodan"
    description = "Shodan DNS database"
    requires_keys = ("SHODAN_API_KEY",)
    default_enabled = False

    def enumerate(self, domain):
        data = self.http.get_json(
            f"https://api.shodan.io/dns/domain/{domain}",
            params={"key": self.key("SHODAN_API_KEY")},
            timeout=45,
        )
        for sub in data.get("subdomains", []) or []:
            yield f"{sub}.{domain}"


class Censys(Source):
    name = "censys"
    description = "Censys certificates search (host names on certs)"
    requires_keys = ("CENSYS_API_ID", "CENSYS_API_SECRET")
    default_enabled = False

    def enumerate(self, domain):
        import base64

        tok = base64.b64encode(
            f"{self.key('CENSYS_API_ID')}:{self.key('CENSYS_API_SECRET')}".encode()
        ).decode()
        headers = {"Authorization": f"Basic {tok}"}
        cursor = None
        for _ in range(20):
            params = {"q": domain, "per_page": 100}
            if cursor:
                params["cursor"] = cursor
            data = self.http.get_json(
                "https://search.censys.io/api/v2/certificates/search",
                params=params,
                headers=headers,
                timeout=60,
            )
            result = data.get("result", {}) or {}
            for hit in result.get("hits", []) or []:
                for name in hit.get("names", []) or []:
                    yield name
            cursor = (result.get("links", {}) or {}).get("next")
            if not cursor:
                return
            time.sleep(1.0)


class Chaos(Source):
    name = "chaos"
    description = "ProjectDiscovery Chaos dataset"
    requires_keys = ("CHAOS_API_KEY",)
    default_enabled = False

    def enumerate(self, domain):
        data = self.http.get_json(
            f"https://dns.projectdiscovery.io/dns/{domain}/subdomains",
            headers={"Authorization": self.key("CHAOS_API_KEY")},
            timeout=45,
        )
        for sub in data.get("subdomains", []) or []:
            yield f"{sub}.{domain}" if sub else domain


class Netlas(Source):
    name = "netlas"
    description = "Netlas.io domains search"
    requires_keys = ("NETLAS_API_KEY",)
    default_enabled = False

    def enumerate(self, domain):
        headers = {"X-API-Key": self.key("NETLAS_API_KEY")}
        data = self.http.get_json(
            "https://app.netlas.io/api/domains/",
            params={"q": f"domain:*.{domain}", "fields": "domain", "source_type": "include"},
            headers=headers,
            timeout=60,
        )
        for item in data.get("items", []) or []:
            d = (item.get("data", {}) or {}).get("domain")
            if d:
                yield d


class BeVigil(Source):
    name = "bevigil"
    description = "BeVigil OSINT subdomains"
    requires_keys = ("BEVIGIL_API_KEY",)
    default_enabled = False

    def enumerate(self, domain):
        data = self.http.get_json(
            f"https://osint.bevigil.com/api/{domain}/subdomains/",
            headers={"X-Access-Token": self.key("BEVIGIL_API_KEY")},
            timeout=45,
        )
        yield from data.get("subdomains", []) or []


class LeakIX(Source):
    name = "leakix"
    description = "LeakIX subdomains"
    requires_keys = ("LEAKIX_API_KEY",)
    default_enabled = False

    def enumerate(self, domain):
        data = self.http.get_json(
            f"https://leakix.net/api/subdomains/{domain}",
            headers={"api-key": self.key("LEAKIX_API_KEY"), "Accept": "application/json"},
            timeout=45,
        )
        if isinstance(data, list):
            for row in data:
                if row.get("subdomain"):
                    yield row["subdomain"]


class GitHub(Source):
    name = "github"
    description = "GitHub code search for hostnames (needs token)"
    requires_keys = ("GITHUB_TOKEN",)
    default_enabled = False

    def enumerate(self, domain):
        headers = {
            "Authorization": f"Bearer {self.key('GITHUB_TOKEN')}",
            "Accept": "application/vnd.github.text-match+json",
        }
        for page in range(1, 11):
            data = self.http.get_json(
                "https://api.github.com/search/code",
                params={"q": domain, "per_page": 100, "page": page},
                headers=headers,
                timeout=45,
            )
            items = data.get("items", []) or []
            if not items:
                return
            for item in items:
                # Search the text match fragments if present, else the path.
                for m in item.get("text_matches", []) or []:
                    yield from extract_hosts(m.get("fragment", ""), domain)
                yield from extract_hosts(item.get("name", ""), domain)
            if len(items) < 100:
                return
            time.sleep(3.0)  # GitHub code search: strict secondary rate limits
