"""Per-domain, per-source result cache.

Public sources fail often (crt.sh overload, quotas, Internet Archive outages).
Subdomains don't vanish from CT logs or passive-DNS history, so when a source
fails - or suddenly returns nothing - its last good results are reused instead
of silently shrinking the output.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .engine import Result

CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "subenum"


def _path(domain: str) -> Path:
    return CACHE_DIR / f"{domain}.json"


def load(domain: str) -> dict:
    try:
        data = json.loads(_path(domain).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save(domain: str, data: dict) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = _path(domain).with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=1, sort_keys=True))
        tmp.replace(_path(domain))
    except OSError:
        pass  # caching is best-effort


def apply(result: Result, log=None) -> None:
    """Refresh the cache from successful sources and back-fill failed ones."""
    domain = result.domain
    cache = load(domain)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    fresh: dict[str, set[str]] = {}
    for host, sources in list(result.hosts.items()):
        for s in sources:
            fresh.setdefault(s, set()).add(host)

    for name, stat in result.stats.items():
        got = fresh.get(name, set())
        entry = cache.get(name) or {}
        cached = set(entry.get("hosts", []))
        failed = stat.status in ("error", "timeout") or (stat.status == "ok" and not got and cached)

        if stat.status == "ok" and got:
            cache[name] = {"saved_at": now, "hosts": sorted(got)}
        elif failed and cached:
            for host in cached - got:
                result.add(host, name)
            reason = stat.message or "returned no results"
            stat.status = "cached"
            stat.count = len(got | cached)
            stat.message = f"live query failed, reused {len(cached)} names cached {entry.get('saved_at', '?')[:16]} ({reason[:70]})"
            cache[name] = {"saved_at": entry.get("saved_at", now), "hosts": sorted(got | cached)}
            if log:
                log(f"    {name:<16} {'cached':<8} {stat.count:>6} names  - {stat.message}")
        elif failed and got:  # first run, partial results: better than nothing
            cache[name] = {"saved_at": now, "hosts": sorted(got)}

    save(domain, cache)
