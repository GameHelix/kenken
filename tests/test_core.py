"""Unit tests for the pure-logic pieces (no network). Run: python3 -m pytest tests
or simply python3 tests/test_core.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from subenum.core import extract_hosts, extract_wildcards, normalize
from subenum import brute
from subenum.engine import Result


D = "example.com"


def test_normalize_basic():
    assert normalize("foo.example.com", D) == "foo.example.com"
    assert normalize("FOO.Example.COM", D) == "foo.example.com"
    assert normalize("foo.example.com.", D) == "foo.example.com"
    assert normalize("example.com", D) == "example.com"


def test_normalize_strips_wrappers():
    assert normalize("*.foo.example.com", D) == "foo.example.com"
    assert normalize("**.foo.example.com", D) == "foo.example.com"
    assert normalize("https://a.b.example.com:8443/x?y=1", D) == "a.b.example.com"
    assert normalize("user@mail.example.com", D) == "mail.example.com"
    assert normalize("  'foo.example.com',  ", D) == "foo.example.com"
    assert normalize("foo.example.com\n", D) == "foo.example.com"


def test_normalize_rejects_outside_domain():
    assert normalize("foo.notexample.com", D) is None
    assert normalize("example.com.evil.com", D) is None
    assert normalize("myexample.com", D) is None
    assert normalize("", D) is None
    assert normalize("-bad.example.com", D) is None
    assert normalize("bad-.example.com", D) is None


def test_normalize_idn():
    # bücher.example.com -> punycode
    assert normalize("bücher.example.com", D) == "xn--bcher-kva.example.com"


def test_extract_from_messy_text():
    text = (
        "visit https://api.example.com/x and //CDN.Example.com:443/ "
        "or \\nfoo.example.com %2Fbar.example.com <a>www.example.com</a> "
        "notexample.com evil.com.example.org sub.example.com.tr "
        "\"json.example.com\", *.wild.example.com"
    )
    hosts = extract_hosts(text, D)
    assert "api.example.com" in hosts
    assert "cdn.example.com" in hosts
    assert "foo.example.com" in hosts
    assert "bar.example.com" in hosts
    assert "www.example.com" in hosts
    assert "json.example.com" in hosts
    assert "wild.example.com" in hosts
    # must NOT capture these
    assert "notexample.com" not in hosts
    assert not any(h.endswith(".tr") for h in hosts)
    assert all(h.endswith("example.com") for h in hosts)


def test_extract_wildcards():
    text = "*.pos.example.com and normal.example.com and *.client.example.com"
    wc = extract_wildcards(text, D)
    assert wc == {"pos.example.com", "client.example.com"}


def test_extract_no_apex():
    # bare apex mentions shouldn't appear as a subdomain
    assert "example.com" not in extract_hosts("see example.com here", D)


def test_result_dedup_and_sort():
    r = Result(D)
    r.add("b.example.com", "s1")
    r.add("B.Example.com", "s2")  # same host, different source
    r.add("*.a.example.com", "s1")
    r.add("z.a.example.com", "s3")
    r.add("example.com", "s1")  # apex excluded from subdomains()
    subs = r.subdomains()
    # hierarchical sort (reversed labels): a.example.com groups with its child
    assert subs == ["a.example.com", "z.a.example.com", "b.example.com"]
    assert r.hosts["b.example.com"] == {"s1", "s2"}
    assert "a.example.com" in r.wildcard_names


def test_permutations_bounded_and_shaped():
    hosts = ["api.example.com", "dev.example.com"]
    perms = brute.permutations(hosts, D, cap=5000)
    assert all(p.endswith(f".{D}") for p in perms)
    assert "api-dev.example.com" in perms or "dev-api.example.com" in perms
    assert "prod.example.com" in perms  # dev->prod swap
    assert len(perms) <= 5000


def test_builtin_wordlist_unique():
    wl = brute.builtin_wordlist()
    assert len(wl) == len(set(wl))
    assert "www" in wl and "api" in wl


def _run():
    ns = dict(globals())
    tests = [v for k, v in ns.items() if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL {t.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"  ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run())
