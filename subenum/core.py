"""Core primitives shared by every module: HTTP client, hostname normalisation,
free-text hostname extraction, and the Source plugin base class.

Everything here is standard-library only so the tool runs with zero installs.
"""
from __future__ import annotations

import gzip
import http.client
import json
import os
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from dataclasses import dataclass, field
from typing import Callable, Iterable

DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
)

RETRY_STATUSES = (429, 500, 502, 503, 504, 520, 521, 522, 524)


class SourceError(Exception):
    """A source could not produce results (bad status, quota exhausted, parse error...)."""


class SkipSource(Exception):
    """A source was deliberately skipped (e.g. its API key is not configured)."""


# --------------------------------------------------------------------------- HTTP


@dataclass
class Response:
    url: str
    status: int
    headers: dict  # lower-cased header names
    body: bytes

    @property
    def text(self) -> str:
        charset = "utf-8"
        m = re.search(r"charset=\"?([\w-]+)", self.headers.get("content-type", ""), re.I)
        if m:
            charset = m.group(1)
        try:
            return self.body.decode(charset, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")

    def json(self):
        try:
            return json.loads(self.text)
        except ValueError as e:
            raise SourceError(
                f"invalid JSON from {self.url}: {e}; body starts {self.text[:160]!r}"
            ) from None


def _decode_body(raw: bytes, encoding: str | None) -> bytes:
    encoding = (encoding or "").lower()
    try:
        if encoding == "gzip" or raw[:2] == b"\x1f\x8b":
            return gzip.decompress(raw)
        if encoding == "deflate":
            try:
                return zlib.decompress(raw)
            except zlib.error:
                return zlib.decompress(raw, -zlib.MAX_WBITS)
    except (OSError, EOFError, zlib.error):
        return raw
    return raw


class HTTPClient:
    """Small urllib wrapper with retries, gzip, proxy support and a global rate gate."""

    def __init__(
        self,
        timeout: float = 30.0,
        retries: int = 2,
        user_agent: str = DEFAULT_UA,
        proxy: str | None = None,
        insecure: bool = False,
        verbose: bool = False,
    ):
        self.timeout = timeout
        self.retries = retries
        self.user_agent = user_agent
        self.verbose = verbose
        ctx = ssl.create_default_context()
        if insecure:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        handlers: list = [urllib.request.HTTPSHandler(context=ctx)]
        if proxy:
            handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
        self._opener = urllib.request.build_opener(*handlers)

    def request(
        self,
        url: str,
        *,
        method: str = "GET",
        params: dict | None = None,
        headers: dict | None = None,
        data: bytes | str | dict | None = None,
        json_body=None,
        timeout: float | None = None,
        retries: int | None = None,
        ok: Iterable[int] = (200,),
    ) -> Response:
        """Perform a request. Raises SourceError unless the final status is in `ok`."""
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        hdrs = {
            "User-Agent": self.user_agent,
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
        }
        if headers:
            hdrs.update(headers)
        body: bytes | None = None
        if json_body is not None:
            body = json.dumps(json_body).encode()
            hdrs.setdefault("Content-Type", "application/json")
        elif isinstance(data, dict):
            body = urllib.parse.urlencode(data).encode()
            hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")
        elif isinstance(data, str):
            body = data.encode()
        elif data is not None:
            body = data
        if body is not None and method == "GET":
            method = "POST"

        ok = tuple(ok)
        attempts = 1 + (self.retries if retries is None else retries)
        last_err: SourceError | None = None
        for attempt in range(attempts):
            req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
            try:
                with self._opener.open(req, timeout=timeout or self.timeout) as r:
                    raw = r.read()
                    resp = Response(
                        r.geturl(),
                        r.status,
                        {k.lower(): v for k, v in r.headers.items()},
                        _decode_body(raw, r.headers.get("Content-Encoding")),
                    )
            except urllib.error.HTTPError as e:
                try:
                    raw = e.read() or b""
                except Exception:
                    raw = b""
                h = {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
                resp = Response(url, e.code, h, _decode_body(raw, h.get("content-encoding")))
            except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError) as e:
                last_err = SourceError(f"{method} {url}: {getattr(e, 'reason', e)}")
                if attempt + 1 < attempts:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise last_err from None

            if self.verbose:
                print(f"[http] {method} {url} -> {resp.status} ({len(resp.body)} bytes)", file=sys.stderr)
            if resp.status in ok:
                return resp
            last_err = SourceError(f"HTTP {resp.status} from {url}: {resp.text[:200]!r}")
            if resp.status in RETRY_STATUSES and attempt + 1 < attempts:
                delay = 2.0 * (attempt + 1)
                ra = resp.headers.get("retry-after", "")
                if ra.isdigit():
                    delay = float(ra)
                if delay > 30:  # quota style limits: give up instead of stalling the run
                    break
                time.sleep(delay)
                continue
            break
        raise last_err  # type: ignore[misc]

    def get(self, url: str, **kw) -> Response:
        return self.request(url, **kw)

    def get_text(self, url: str, **kw) -> str:
        return self.request(url, **kw).text

    def get_json(self, url: str, **kw):
        kw.setdefault("headers", {})
        kw["headers"] = {"Accept": "application/json", **kw["headers"]}
        return self.request(url, **kw).json()


# ------------------------------------------------------------ hostname handling

_LABEL_RE = re.compile(r"^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$")

# Escape sequences that commonly sit directly in front of hostnames in scraped
# HTML/JS/JSON (e.g. "\nfoo.example.com", "%2Ffoo.example.com", "/foo...").
# They are replaced by a space before extraction so they don't glue onto labels.
_ESCAPES_RE = re.compile(
    r"%[0-9a-f]{2}|\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\[nrtfvb0/\\\"']|&#x?[0-9a-f]+;|&[a-z]{2,8};",
    re.I,
)


def normalize(name: str, domain: str) -> str | None:
    """Return a clean lower-case hostname under `domain` (or `domain` itself), else None.

    Accepts raw values such as '*.Foo.example.com.', 'https://foo.example.com:8443/x',
    'foo.example.com\\n'. Wildcard prefixes are stripped.
    """
    if not name:
        return None
    n = name.strip().strip("\"'<>()[]{},;").lower()
    if n.startswith("//"):
        n = "http:" + n
    if "://" in n:
        n = urllib.parse.urlsplit(n).hostname or ""
    n = n.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    if "@" in n:
        n = n.rsplit("@", 1)[1]
    if n.count(":") == 1:
        n = n.split(":", 1)[0]
    n = n.rstrip(".")
    n = n.lstrip("*.")  # strip any leading wildcard/dot run, e.g. '*.', '**.', '.'
    if not n.isascii():
        try:
            n = n.encode("idna").decode("ascii")
        except UnicodeError:
            return None
    domain = domain.lower().rstrip(".")
    if n != domain and not n.endswith("." + domain):
        return None
    if len(n) > 253:
        return None
    if not all(_LABEL_RE.match(label) for label in n.split(".")):
        return None
    return n


def is_wildcard_name(name: str) -> bool:
    return name.strip().startswith("*.")


def extract_hosts(text: str, domain: str) -> set[str]:
    """Find every hostname under `domain` inside arbitrary text (HTML, JS, JSON, CSV...).

    Returns normalised names; wildcard markers are stripped (use extract_wildcards
    to keep them).
    """
    return {h for h, _ in _iter_hosts(text, domain)}


def extract_wildcards(text: str, domain: str) -> set[str]:
    """Like extract_hosts but returns only names that appeared as '*.x.domain'."""
    return {h for h, wc in _iter_hosts(text, domain) if wc}


_pattern_cache: dict[str, re.Pattern] = {}


def _host_pattern(domain: str) -> re.Pattern:
    p = _pattern_cache.get(domain)
    if p is None:
        p = re.compile(
            r"(?<![a-z0-9_-])(\*\.)?((?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+"
            + re.escape(domain)
            + r")(?![a-z0-9_-])(?!\.[a-z0-9])",
            re.I,
        )
        _pattern_cache[domain] = p
    return p


def _iter_hosts(text: str, domain: str):
    if not text:
        return
    domain = domain.lower().rstrip(".")
    text = _ESCAPES_RE.sub(" ", text)
    for m in _host_pattern(domain).finditer(text):
        h = normalize(m.group(2), domain)
        if h and h != domain:
            yield h, bool(m.group(1))


# ---------------------------------------------------------------- plugin API


@dataclass
class Context:
    """Shared state handed to every Source."""

    http: HTTPClient
    keys: dict = field(default_factory=dict)  # API keys: env-var-style name -> value
    log: Callable[[str], None] = lambda msg: None
    options: dict = field(default_factory=dict)  # free-form CLI options (threads, wordlist...)

    def key(self, name: str) -> str | None:
        v = self.keys.get(name) or os.environ.get(name)
        return v.strip() if v else None


class Source:
    """Base class for a subdomain source.

    Subclasses set `name` (unique, lower-case, used on the CLI), `description`,
    optionally `requires_keys` (env var names that must all be set, e.g.
    ("VIRUSTOTAL_API_KEY",)) and `kind` ("passive" never touches the target;
    "active" sends traffic to the target's own infrastructure).

    `enumerate(domain)` yields raw names/strings; the engine normalises and
    de-duplicates them, so sources may yield '*.x.domain', URLs, etc. Yield
    incrementally so partial results survive a timeout. Raise SourceError on
    failure and SkipSource to skip cleanly.
    """

    name: str = ""
    description: str = ""
    kind: str = "passive"
    requires_keys: tuple[str, ...] = ()
    default_enabled: bool = True  # included in the default passive run

    def __init__(self, ctx: Context):
        self.ctx = ctx
        self.http = ctx.http

    def key(self, name: str) -> str:
        v = self.ctx.key(name)
        if not v:
            raise SkipSource(f"{name} not set")
        return v

    def enumerate(self, domain: str) -> Iterable[str]:  # pragma: no cover - interface
        raise NotImplementedError


_lock = threading.Lock()


def eprint(*args, **kw) -> None:
    with _lock:
        print(*args, file=sys.stderr, **kw)
