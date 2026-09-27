"""Runs sources concurrently and merges their output."""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Iterable

from .core import Context, SkipSource, Source, SourceError, is_wildcard_name, normalize


@dataclass
class SourceStat:
    name: str
    status: str = "pending"  # ok | error | skipped | timeout
    count: int = 0  # unique valid names this source produced
    seconds: float = 0.0
    message: str = ""


@dataclass
class Result:
    domain: str
    hosts: dict[str, set[str]] = field(default_factory=dict)  # host -> sources
    wildcard_names: set[str] = field(default_factory=set)  # hosts seen as '*.host'
    stats: dict[str, SourceStat] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add(self, raw: str, source: str) -> str | None:
        host = normalize(raw, self.domain)
        if not host:
            return None
        with self._lock:
            self.hosts.setdefault(host, set()).add(source)
            if is_wildcard_name(raw):
                self.wildcard_names.add(host)
        return host

    def subdomains(self) -> list[str]:
        """Sorted hosts excluding the apex itself."""
        with self._lock:
            hosts = [h for h in self.hosts if h != self.domain]
        return sorted(hosts, key=_sort_key)


def _sort_key(host: str):
    return list(reversed(host.split(".")))


def run_sources(
    domain: str,
    source_classes: Iterable[type[Source]],
    ctx: Context,
    result: Result | None = None,
    timeout: float = 180.0,
    concurrency: int = 16,
    on_done=None,
) -> Result:
    """Run every source in its own daemon thread (bounded by `concurrency`).

    A source that exceeds `timeout` keeps whatever it yielded so far and is
    reported with status 'timeout'. `on_done(stat)` is called as each finishes.
    """
    result = result or Result(domain)
    gate = threading.Semaphore(concurrency)
    box_lock = threading.Lock()
    threads: list[tuple[threading.Thread, SourceStat, dict]] = []

    def worker(cls: type[Source], stat: SourceStat, box: dict):
        with gate:
            start = time.monotonic()
            box["start"] = start
            seen: set[str] = set()
            try:
                src = cls(ctx)
                for raw in src.enumerate(domain) or ():
                    if box.get("abandoned"):
                        return
                    host = result.add(str(raw), cls.name)
                    if host:
                        seen.add(host)
                        stat.count = len(seen)
                stat.status = "ok"
            except SkipSource as e:
                stat.status, stat.message = "skipped", str(e)
            except SourceError as e:
                stat.status, stat.message = "error", str(e)
            except Exception as e:  # plugin bug: report, never crash the run
                stat.status, stat.message = "error", f"{type(e).__name__}: {e}"
            finally:
                with box_lock:
                    report = not box.get("abandoned")
                    if report:
                        box["done"] = True
                        stat.seconds = time.monotonic() - start
                if report and on_done:
                    on_done(stat)

    for cls in source_classes:
        stat = SourceStat(cls.name)
        result.stats[cls.name] = stat
        box: dict = {}
        t = threading.Thread(target=worker, args=(cls, stat, box), daemon=True, name=f"src-{cls.name}")
        threads.append((t, stat, box))
        t.start()

    # Each source gets `timeout` seconds from the moment it actually starts
    # running (sources queued behind the semaphore are not penalised).
    while True:
        pending = [(t, s, b) for t, s, b in threads if t.is_alive()]
        if not pending:
            break
        now = time.monotonic()
        for t, stat, box in pending:
            start = box.get("start")
            if start is None or now - start <= timeout:
                continue
            with box_lock:
                if box.get("abandoned") or box.get("done"):
                    continue
                box["abandoned"] = True
                stat.status = "timeout"
                stat.seconds = now - start
                stat.message = f"exceeded {timeout:.0f}s (kept {stat.count} partial results)"
                if on_done:
                    on_done(stat)
        if all(b.get("abandoned") for _, _, b in pending):
            break
        time.sleep(0.2)
    return result
