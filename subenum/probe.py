"""Lightweight HTTP(S) prober: status, title, server, redirect. Standard library only."""
from __future__ import annotations

import re
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field

from .core import HTTPClient

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


@dataclass
class HostHTTP:
    host: str
    url: str = ""
    final_url: str = ""
    status: int = 0
    title: str = ""
    server: str = ""
    length: int = 0
    redirect: str = ""
    error: str = ""

    def to_dict(self):
        return asdict(self)


def _probe_one(client: HTTPClient, host: str) -> HostHTTP:
    rec = HostHTTP(host)
    for scheme in ("https", "http"):
        url = f"{scheme}://{host}"
        try:
            resp = client.request(
                url, timeout=12, retries=0,
                ok=tuple(range(100, 600)),  # accept any status; we just want the response
                headers={"Accept": "text/html,*/*"},
            )
        except Exception as e:
            rec.error = str(e)[:120]
            continue
        rec.url = url
        rec.final_url = resp.url
        rec.status = resp.status
        rec.server = resp.headers.get("server", "")
        rec.length = len(resp.body)
        loc = resp.headers.get("location", "")
        if loc:
            rec.redirect = loc
        ctype = resp.headers.get("content-type", "")
        if "html" in ctype or not ctype:
            m = _TITLE_RE.search(resp.text[:20000])
            if m:
                rec.title = re.sub(r"\s+", " ", m.group(1)).strip()[:200]
        rec.error = ""
        return rec  # first successful scheme wins
    return rec


def probe_many(hosts, domain: str = "", workers: int = 50, log=None) -> dict[str, HostHTTP]:
    hosts = list(dict.fromkeys(hosts))
    client = HTTPClient(timeout=12, retries=0)
    out: dict[str, HostHTTP] = {}
    lock = threading.Lock()
    done = 0

    def work(h):
        nonlocal done
        rec = _probe_one(client, h)
        with lock:
            out[h] = rec
            done += 1
            if log and done % 200 == 0:
                log(f"    probed {done}/{len(hosts)}")

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, hosts))
    return out
