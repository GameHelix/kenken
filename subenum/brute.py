"""Wildcard-aware DNS brute force and name permutation."""
from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

from .resolver import HostDNS, Resolver

# A compact, high-signal built-in wordlist. Not exhaustive — pass --brute FILE
# (e.g. SecLists) for deep coverage. Ordered roughly by real-world frequency.
_BUILTIN = """
www mail remote blog webmail server ns1 ns2 smtp secure vpn m shop ftp mail2 test
portal admin host support dev web bbs ns api cdn cloud auth login sso app apps mobile
static assets img images video media files download downloads docs doc help wiki status
staging stage prod production qa uat sandbox demo beta alpha rc preview git gitlab github
jenkins ci cd build registry docker k8s kube grafana kibana prometheus elk elastic logs
log monitor monitoring metrics dashboard panel cpanel whm plesk db database mysql postgres
redis mongo cache queue mq rabbit kafka smtp2 imap pop pop3 mx mx1 mx2 email exchange
autodiscover autoconfig owa lync sip voip pbx crm erp hr hrm finance billing pay payment
payments checkout order orders store shop2 cart catalog product products inventory pos
partner partners client clients customer customers user users account accounts profile
id identity oauth idp ldap ad dc gateway gw proxy lb balancer edge origin backend front
frontend ui www2 www3 internal intranet extranet corp office vpn2 remote2 access connect
data analytics stats report reports insight bi warehouse etl pipeline ml ai model models
search elasticsearch solr index chat message messages notify notification push socket ws
websocket rtc stream live broadcast events event webhook webhooks callback integration
integrations service services micro api2 api3 apiv1 apiv2 v1 v2 v3 rest graphql grpc
""".split()


def builtin_wordlist() -> list[str]:
    return list(dict.fromkeys(_BUILTIN))


def load_wordlist(path: str) -> list[str]:
    words = []
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            w = line.strip().lower()
            if w and not w.startswith("#"):
                words.append(w)
    return list(dict.fromkeys(words))


# Affixes used to derive permutations from already-known names.
_AFFIXES = (
    "dev", "staging", "stage", "prod", "test", "qa", "uat", "demo", "beta", "alpha",
    "rc", "new", "old", "v1", "v2", "v3", "api", "app", "internal", "admin", "1", "2", "3",
)


def permutations(hosts: list[str], domain: str, cap: int = 20000) -> set[str]:
    """Generate plausible new full hostnames from the labels of known ones.

    Combines observed sub-labels with common affixes and swaps environment tokens.
    Bounded by `cap`.
    """
    base_labels: set[str] = set()
    for h in hosts:
        if not h.endswith(domain):
            continue
        prefix = h[: -(len(domain) + 1)]
        for part in prefix.split("."):
            if part:
                base_labels.add(part)

    out: set[str] = set()

    def add(label: str):
        if label and len(out) < cap:
            out.add(f"{label}.{domain}")

    for lbl in base_labels:
        for aff in _AFFIXES:
            add(f"{aff}-{lbl}")
            add(f"{lbl}-{aff}")
            add(f"{aff}{lbl}")
            add(f"{lbl}{aff}")
        # environment token swaps within a label (dev<->prod etc.)
        for a in ("dev", "test", "staging", "stage", "prod", "qa", "uat"):
            if a in lbl:
                for b in ("dev", "test", "staging", "prod", "qa", "uat", "demo"):
                    add(lbl.replace(a, b))
        if len(out) >= cap:
            break
    return out


def brute_force(domain: str, candidates, resolver: Resolver, log=None) -> dict[str, HostDNS]:
    """Resolve every candidate; return only names that exist AND are not wildcard matches."""
    candidates = list(dict.fromkeys(candidates))
    if not candidates:
        return {}
    resolver._ensure_backend(log)
    resolver.wildcard_for(domain)  # warm apex fingerprint
    found: dict[str, HostDNS] = {}
    lock = threading.Lock()
    done = 0

    def work(h):
        nonlocal done
        rec = resolver.resolve(h)
        if rec.status == "resolved":
            rec.wildcard = resolver._is_wildcard_answer(rec, domain)
            if not rec.wildcard:
                with lock:
                    found[h] = rec
        with lock:
            done += 1
            if log and done % 500 == 0:
                log(f"    brute {done}/{len(candidates)} ({len(found)} live)")

    with ThreadPoolExecutor(max_workers=resolver.workers) as ex:
        list(ex.map(work, candidates))
    return found
