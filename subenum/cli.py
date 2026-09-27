"""Command line interface: python -m subenum example.com"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .core import Context, HTTPClient, eprint, normalize
from .engine import Result, run_sources
from .sources import load_sources

DEFAULT_KEYS_FILE = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "subenum" / "keys.json"


def load_keys(path: Path | None) -> dict:
    """API keys from a JSON object or KEY=VALUE lines. Environment variables win."""
    keys: dict = {}
    if path and path.is_file():
        text = path.read_text()
        try:
            obj = json.loads(text)
            if not isinstance(obj, dict):
                raise ValueError("keys file must be a JSON object")
            keys = {k: str(v) for k, v in obj.items() if v}
        except ValueError:
            for line in text.splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    keys[k.strip()] = v.strip().strip("'\"")
    for k, v in os.environ.items():
        if k.endswith(("_API_KEY", "_TOKEN", "_SECRET", "_API_ID", "_KEY")) and v:
            keys[k] = v
    return keys


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="subenum",
        description="Enumerate subdomains from certificate transparency, passive DNS, web archives, "
        "search indexes and (optionally) active DNS/HTTP techniques.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="examples:\n"
        "  subenum clopos.com\n"
        "  subenum clopos.com --resolve --probe --json report.json\n"
        "  subenum clopos.com --active --brute --permute -o subs.txt\n"
        "  subenum --list-sources",
    )
    p.add_argument("domains", nargs="*", help="target domain(s), e.g. clopos.com")
    p.add_argument("-dL", "--domain-list", type=Path, help="file with one domain per line")
    g = p.add_argument_group("sources")
    g.add_argument("-s", "--sources", help="comma-separated sources to use (default: all default passive sources)")
    g.add_argument("-es", "--exclude-sources", help="comma-separated sources to skip")
    g.add_argument("--active", action="store_true", help="also run active sources (crawl target sites, TLS certs...)")
    g.add_argument("--all", action="store_true", help="run every source including non-default and active ones")
    g.add_argument("--list-sources", action="store_true", help="list sources and exit")
    g.add_argument("--keys", type=Path, default=DEFAULT_KEYS_FILE, help=f"API keys file (default {DEFAULT_KEYS_FILE})")
    g.add_argument("--source-timeout", type=float, default=180, help="max seconds per source (default 180)")
    g.add_argument("--no-cache", action="store_true",
                   help="don't reuse/save per-source results in ~/.cache/subenum (by default a failed source falls back to its last good results)")
    g = p.add_argument_group("resolution / active discovery")
    g.add_argument("--resolve", action="store_true", help="resolve every name (DNS-over-HTTPS) and detect wildcard DNS")
    g.add_argument("--resolver", choices=("doh", "system"), default="doh", help="resolution backend (default doh)")
    g.add_argument("--brute", nargs="?", const="builtin", metavar="WORDLIST",
                   help="wildcard-aware DNS brute force (built-in list if no file given); implies --resolve")
    g.add_argument("--permute", action="store_true", help="try permutations of discovered names; implies --resolve")
    g.add_argument("--probe", action="store_true", help="HTTP(S) probe hosts: status, title, server; implies --resolve")
    g.add_argument("--alive-only", action="store_true", help="only output names that resolve (implies --resolve)")
    g = p.add_argument_group("output")
    g.add_argument("-o", "--output", type=Path, help="write plain subdomain list to file")
    g.add_argument("--json", type=Path, help="write full JSON report")
    g.add_argument("--csv", type=Path, help="write CSV report")
    g.add_argument("--include-apex", action="store_true", help="include the apex domain in the list")
    g.add_argument("-q", "--silent", action="store_true", help="only print subdomains")
    g.add_argument("-v", "--verbose", action="store_true", help="log every HTTP request")
    g = p.add_argument_group("network")
    g.add_argument("-t", "--threads", type=int, default=50, help="worker threads for resolve/probe/brute (default 50)")
    g.add_argument("--timeout", type=float, default=30, help="HTTP timeout seconds (default 30)")
    g.add_argument("--proxy", help="HTTP(S) proxy URL for source requests")
    g.add_argument("--insecure", action="store_true", help="disable TLS verification for source requests")
    p.add_argument("-V", "--version", action="version", version=f"subenum {__version__}")
    return p


def select_sources(args, registry: dict) -> list:
    include_active = args.active or args.all
    if args.sources:
        wanted = [s.strip().lower() for s in args.sources.split(",") if s.strip()]
        unknown = [s for s in wanted if s not in registry]
        if unknown:
            raise SystemExit(f"unknown source(s): {', '.join(unknown)} (see --list-sources)")
        chosen = [registry[s] for s in wanted]
    else:
        chosen = [
            c for c in registry.values()
            if args.all
            or (c.kind == "passive" and c.default_enabled)
            or (include_active and c.kind == "active" and c.default_enabled)
        ]
    if args.exclude_sources:
        skip = {s.strip().lower() for s in args.exclude_sources.split(",")}
        chosen = [c for c in chosen if c.name not in skip]
    return chosen


def list_sources(registry: dict, keys: dict) -> None:
    print(f"{'name':<18} {'kind':<8} {'default':<8} {'key':<28} description")
    for c in registry.values():
        need = ",".join(c.requires_keys) or "-"
        if c.requires_keys:
            need += " ✓" if all(keys.get(k) for k in c.requires_keys) else " ✗"
        print(f"{c.name:<18} {c.kind:<8} {'yes' if c.default_enabled else 'no':<8} {need:<28} {c.description}")


def enumerate_domain(domain: str, args, registry: dict, ctx: Context, log) -> dict:
    t0 = time.monotonic()
    sources = select_sources(args, registry)
    log(f"[*] {domain}: querying {len(sources)} sources: {', '.join(c.name for c in sources)}")

    def on_done(stat):
        extra = f" - {stat.message}" if stat.message else ""
        log(f"    {stat.name:<16} {stat.status:<8} {stat.count:>6} names  {stat.seconds:6.1f}s{extra}")

    result = run_sources(domain, sources, ctx, timeout=args.source_timeout, on_done=on_done)
    if not args.no_cache:
        from . import cache

        cache.apply(result, log=log)
    log(f"[+] {domain}: {len(result.subdomains())} unique subdomains from sources")

    dns_info: dict = {}
    http_info: dict = {}
    wildcards: dict = {}
    need_resolve = args.resolve or args.brute or args.permute or args.probe or args.alive_only
    if need_resolve:
        from .resolver import Resolver

        resolver = Resolver(ctx.http, mode=args.resolver, workers=args.threads)
        if args.brute or args.permute:
            from . import brute

            candidates: set[str] = set()
            if args.brute:
                words = brute.builtin_wordlist() if args.brute == "builtin" else brute.load_wordlist(args.brute)
                candidates |= {f"{w}.{domain}" for w in words}
            if args.permute:
                candidates |= brute.permutations(result.subdomains(), domain)
            candidates -= set(result.hosts)
            log(f"[*] {domain}: brute/permute testing {len(candidates)} candidate names")
            found = brute.brute_force(domain, candidates, resolver, log=log)
            for host in found:
                result.add(host, "bruteforce")
            dns_info.update(found)
            log(f"[+] {domain}: brute/permute found {len(found)} new names")

        todo = [h for h in result.hosts if h not in dns_info]
        log(f"[*] {domain}: resolving {len(todo)} names")
        dns_info.update(resolver.resolve_many(todo, domain, log=log))
        wildcards = {k: v.to_dict() if hasattr(v, "to_dict") else v for k, v in resolver.wildcards.items()}
        alive = sum(1 for d in dns_info.values() if d.status == "resolved")
        log(f"[+] {domain}: {alive} names resolve ({sum(1 for d in dns_info.values() if d.wildcard)} match wildcard DNS)")

    hosts = result.subdomains()
    if args.include_apex:
        hosts = [domain] + [h for h in hosts if h != domain]
    if args.alive_only:
        hosts = [h for h in hosts if h in dns_info and dns_info[h].status == "resolved"]

    if args.probe:
        from .probe import probe_many

        targets = [h for h in hosts if h not in dns_info or dns_info[h].status == "resolved"]
        log(f"[*] {domain}: HTTP probing {len(targets)} hosts")
        http_info = probe_many(targets, domain=domain, workers=args.threads, log=log)

    return {
        "domain": domain,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "elapsed_seconds": round(time.monotonic() - t0, 1),
        "count": len(hosts),
        "sources": {
            n: {"status": s.status, "count": s.count, "seconds": round(s.seconds, 1), "message": s.message}
            for n, s in result.stats.items()
        },
        "dns_wildcards": wildcards,
        "hosts": [
            {
                "host": h,
                "sources": sorted(result.hosts.get(h, ())),
                "wildcard_certificate": h in result.wildcard_names,
                **({"dns": dns_info[h].to_dict()} if h in dns_info else {}),
                **({"http": http_info[h].to_dict()} if h in http_info else {}),
            }
            for h in hosts
        ],
    }


def write_csv(path: Path, reports: list[dict]) -> None:
    with path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["host", "domain", "sources", "dns_status", "a", "aaaa", "cname", "wildcard_dns",
                    "http_url", "http_status", "http_title", "http_server"])
        for rep in reports:
            for h in rep["hosts"]:
                d, x = h.get("dns", {}), h.get("http", {})
                w.writerow([
                    h["host"], rep["domain"], " ".join(h["sources"]),
                    d.get("status", ""), " ".join(d.get("a", [])), " ".join(d.get("aaaa", [])),
                    " ".join(d.get("cname", [])), d.get("wildcard", ""),
                    x.get("url", ""), x.get("status", ""), x.get("title", ""), x.get("server", ""),
                ])


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    keys = load_keys(args.keys)
    registry = load_sources()
    if args.list_sources:
        list_sources(registry, keys)
        return 0

    domains = list(args.domains)
    if args.domain_list:
        domains += [l.strip() for l in args.domain_list.read_text().splitlines() if l.strip() and not l.startswith("#")]
    cleaned = []
    for d in domains:
        n = normalize(d, d.split("://")[-1].split("/")[0].split(":")[0].strip().lower().rstrip("."))
        if not n or "." not in n:
            raise SystemExit(f"invalid domain: {d!r}")
        cleaned.append(n)
    if not cleaned:
        build_parser().print_usage(sys.stderr)
        return 2

    log = (lambda m: None) if args.silent else eprint
    http = HTTPClient(timeout=args.timeout, proxy=args.proxy, insecure=args.insecure, verbose=args.verbose)
    ctx = Context(http=http, keys=keys, log=log, options=vars(args))

    reports = []
    for domain in dict.fromkeys(cleaned):
        rep = enumerate_domain(domain, args, registry, ctx, log)
        reports.append(rep)
        for h in rep["hosts"]:
            print(h["host"], flush=True)

    if args.output:
        args.output.write_text("".join(h["host"] + "\n" for r in reports for h in r["hosts"]))
        log(f"[+] wrote {args.output}")
    if args.json:
        payload = reports[0] if len(reports) == 1 else reports
        args.json.write_text(json.dumps(payload, indent=2))
        log(f"[+] wrote {args.json}")
    if args.csv:
        write_csv(args.csv, reports)
        log(f"[+] wrote {args.csv}")
    return 0
