"""DNS resolution with wildcard detection.

Two backends:
  * "doh"   - DNS-over-HTTPS JSON (Cloudflare + Google), no dependencies, works everywhere.
  * "system"- the OS resolver via socket.getaddrinfo (A/AAAA only, no CNAME chain).

Wildcard detection: for each parent zone we probe several random labels. If they
resolve, that zone has a wildcard; any host whose answer set is a subset of the
wildcard's answer set is flagged .wildcard=True (it may still be a real distinct
host behind the same CDN, so it is flagged, never dropped, unless brute-forcing).
"""
from __future__ import annotations

import hashlib
import socket
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field

from .core import HTTPClient, SourceError

DOH_ENDPOINTS = (
    "https://cloudflare-dns.com/dns-query",
    "https://dns.google/resolve",
)


@dataclass
class HostDNS:
    host: str
    status: str = "error"  # resolved | nxdomain | noanswer | servfail | error
    a: list = field(default_factory=list)
    aaaa: list = field(default_factory=list)
    cname: list = field(default_factory=list)
    wildcard: bool = False

    def to_dict(self):
        return asdict(self)


@dataclass
class WildcardInfo:
    zone: str
    has_wildcard: bool
    ips: list = field(default_factory=list)  # sorted union of wildcard answer IPs

    def to_dict(self):
        return asdict(self)


class Resolver:
    def __init__(self, http: HTTPClient, mode: str = "doh", workers: int = 50):
        self.http = http
        self.mode = mode
        self.workers = workers
        self.wildcards: dict[str, WildcardInfo] = {}
        self._wc_lock = threading.Lock()
        self._doh_idx = 0
        self._backend_checked = False
        self._backend_lock = threading.Lock()

    def _ensure_backend(self, log=None):
        """One-time health check: if DoH is unreachable (blocked network, corporate
        firewall), fall back to the system resolver so --resolve still works."""
        if self.mode != "doh":
            return
        with self._backend_lock:
            if self._backend_checked:
                return
            self._backend_checked = True
            for endpoint in DOH_ENDPOINTS:
                try:
                    self.http.get_json(
                        endpoint,
                        params={"name": "cloudflare.com", "type": "1"},
                        headers={"Accept": "application/dns-json"},
                        timeout=6,
                        retries=0,
                    )
                    return  # DoH works
                except SourceError:
                    continue
            self.mode = "system"
            if log:
                log("[!] DNS-over-HTTPS unreachable (blocked?); falling back to system resolver")

    # ------------------------------------------------------------ low level

    def _doh_query(self, name: str, rrtype: str) -> tuple[str, list]:
        endpoint = DOH_ENDPOINTS[self._doh_idx % len(DOH_ENDPOINTS)]
        self._doh_idx += 1
        try:
            data = self.http.get_json(
                endpoint,
                params={"name": name, "type": rrtype_num(rrtype)},
                headers={"Accept": "application/dns-json"},
                timeout=6,
                retries=1,
            )
        except SourceError:
            # try the other endpoint once
            other = DOH_ENDPOINTS[(self._doh_idx) % len(DOH_ENDPOINTS)]
            self._doh_idx += 1
            try:
                data = self.http.get_json(
                    other,
                    params={"name": name, "type": rrtype_num(rrtype)},
                    headers={"Accept": "application/dns-json"},
                    timeout=6,
                    retries=1,
                )
            except SourceError:
                return "error", []
        status_code = data.get("Status", 2)
        status = {0: "ok", 3: "nxdomain"}.get(status_code, "servfail")
        answers = data.get("Answer", []) or []
        return status, answers

    def resolve(self, host: str) -> HostDNS:
        if self.mode == "system":
            return self._resolve_system(host)
        return self._resolve_doh(host)

    def _resolve_doh(self, host: str) -> HostDNS:
        rec = HostDNS(host)
        status_a, ans_a = self._doh_query(host, "A")
        if status_a == "nxdomain":
            rec.status = "nxdomain"
            return rec
        if status_a == "error":
            rec.status = "error"
            return rec
        for a in ans_a:
            t = a.get("type")
            val = a.get("data", "").strip('"')
            if t == 1:  # A
                rec.a.append(val)
            elif t == 5:  # CNAME
                rec.cname.append(val.rstrip("."))
        _, ans_aaaa = self._doh_query(host, "AAAA")
        for a in ans_aaaa:
            if a.get("type") == 28:
                rec.aaaa.append(a.get("data", ""))
            elif a.get("type") == 5:
                cn = a.get("data", "").rstrip(".")
                if cn not in rec.cname:
                    rec.cname.append(cn)
        if rec.a or rec.aaaa:
            rec.status = "resolved"
        elif rec.cname:
            rec.status = "resolved"
        else:
            rec.status = "noanswer"
        return rec

    def _resolve_system(self, host: str) -> HostDNS:
        rec = HostDNS(host)
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror as e:
            rec.status = "nxdomain" if e.errno in (socket.EAI_NONAME, -2, 8) else "error"
            return rec
        except OSError:
            rec.status = "error"
            return rec
        for family, _, _, _, sockaddr in infos:
            ip = sockaddr[0]
            if family == socket.AF_INET and ip not in rec.a:
                rec.a.append(ip)
            elif family == socket.AF_INET6 and ip not in rec.aaaa:
                rec.aaaa.append(ip)
        rec.status = "resolved" if (rec.a or rec.aaaa) else "noanswer"
        return rec

    # ------------------------------------------------------- wildcard logic

    def _parents(self, host: str, domain: str) -> list[str]:
        """All parent zones between host and the apex (inclusive of apex)."""
        parents = []
        labels = host.split(".")
        dl = domain.split(".")
        # zones from the host's immediate parent down to the apex
        for i in range(1, len(labels) - len(dl) + 1):
            parents.append(".".join(labels[i:]))
        if domain not in parents:
            parents.append(domain)
        return parents

    def wildcard_for(self, zone: str) -> WildcardInfo:
        with self._wc_lock:
            wc = self.wildcards.get(zone)
        if wc is not None:
            return wc
        ips: set[str] = set()
        hits = 0
        for probe in _probe_labels(zone):
            rec = self.resolve(f"{probe}.{zone}")
            if rec.status == "resolved":
                hits += 1
                ips.update(rec.a)
                ips.update(rec.aaaa)
        wc = WildcardInfo(zone, has_wildcard=hits >= 2, ips=sorted(ips))
        with self._wc_lock:
            self.wildcards.setdefault(zone, wc)
            return self.wildcards[zone]

    def _is_wildcard_answer(self, rec: HostDNS, domain: str) -> bool:
        if rec.status != "resolved":
            return False
        answer = set(rec.a) | set(rec.aaaa)
        if not answer:
            return False
        for zone in self._parents(rec.host, domain):
            wc = self.wildcard_for(zone)
            if wc.has_wildcard and answer and answer.issubset(set(wc.ips)):
                return True
        return False

    # --------------------------------------------------------------- batch

    def resolve_many(self, hosts, domain: str, log=None) -> dict[str, HostDNS]:
        self._ensure_backend(log)
        hosts = list(dict.fromkeys(hosts))
        # Pre-compute wildcard fingerprint for the apex so threads don't stampede.
        self.wildcard_for(domain)
        out: dict[str, HostDNS] = {}
        done = 0
        lock = threading.Lock()

        def work(h):
            nonlocal done
            rec = self.resolve(h)
            rec.wildcard = self._is_wildcard_answer(rec, domain)
            with lock:
                out[h] = rec
                done += 1
                if log and done % 250 == 0:
                    log(f"    resolved {done}/{len(hosts)}")

        with ThreadPoolExecutor(max_workers=self.workers) as ex:
            list(ex.map(work, hosts))
        return out


def rrtype_num(rrtype: str) -> str:
    return {"A": "1", "AAAA": "28", "CNAME": "5", "NS": "2", "TXT": "16", "MX": "15"}.get(rrtype, "1")


def _probe_labels(zone: str) -> list[str]:
    """Deterministic pseudo-random probe labels (no Math.random / Date needed)."""
    h = hashlib.sha256(zone.encode()).hexdigest()
    return [f"wildcard-probe-{h[i:i+10]}" for i in (0, 12, 24)]
