# subenum

A subdomain enumeration toolkit. Pure Python 3 standard library — **no pip installs, no external binaries.** Point it at a domain and it aggregates subdomains from certificate-transparency logs, passive-DNS databases, web archives and crawl indexes, then optionally resolves them (with wildcard-DNS detection), brute-forces new ones, and HTTP-probes what's live.

Built for authorized reconnaissance of domains you own or are permitted to test.

## Quick start

```bash
# Passive enumeration (safe — never touches the target's own servers)
python3 -m subenum clopos.com

# Everything: resolve via DNS-over-HTTPS, brute force, permute, HTTP probe, full report
python3 -m subenum clopos.com --resolve --brute --permute --probe \
    --json report.json --csv report.csv -o subs.txt

# List available sources and which API keys are configured
python3 -m subenum --list-sources
```

There is nothing to install. Optionally symlink a launcher:

```bash
ln -sf "$PWD/subenum.py" /opt/homebrew/bin/subenum   # then: subenum clopos.com
```

## What it does

1. **Passive sources** (default) — queries ~15 keyless services plus ~9 more when you supply API keys. Passive sources never send traffic to the target's infrastructure; they only read third-party databases.
2. **`--resolve`** — resolves every discovered name over DNS-over-HTTPS (Cloudflare + Google) or the system resolver, and **detects wildcard DNS** so `*.domain` catch-alls don't produce false "live" hosts.
3. **`--brute`** — wildcard-aware DNS brute force using a built-in wordlist or your own (`--brute /path/to/wordlist.txt`, e.g. SecLists).
4. **`--permute`** — derives and tests plausible new names from what was found (`api` → `api-dev`, `dev-api`, `apiv2`, environment swaps…).
5. **`--probe`** — HTTP(S) probes each host for status code, page title and `Server` header.

## Output

- **stdout** — one hostname per line (pipe it anywhere).
- **`-o file.txt`** — plain hostname list.
- **`--json file.json`** — full structured report: per-host sources, DNS records, wildcard flags, HTTP results, and per-source run stats.
- **`--csv file.csv`** — spreadsheet-friendly table.

## Sources

Run `python3 -m subenum --list-sources`. Keyless by default: crt.sh (web API **and** its public PostgreSQL database — the most complete source), certspotter, hackertarget, alienvault (OTX), anubis, rapiddns, wayback, urlscan, subdomaincenter, columbus, shrewdeye, digitorus, hudsonrock, threatminer. Key-gated (enable with `--all` or `-s name` once the key is set): virustotal, securitytrails, shodan, censys, chaos, netlas, bevigil, leakix, github.

## Cache (failed sources fall back to their last good results)

Public sources fail often (crt.sh overload, certspotter quota, Internet Archive outages). Every successful source result is saved to `~/.cache/subenum/<domain>.json`; when a source errors, times out, or suddenly returns nothing, its cached names are reused and it is reported as `cached`. Subdomains don't disappear from CT logs, so repeated runs never shrink. Disable with `--no-cache`.

## API keys

Keys are read from environment variables **or** a JSON/`KEY=VALUE` file (default `~/.config/subenum/keys.json`, override with `--keys`). See `keys.example.json`. Environment variables always win.

```jsonc
{
  "VIRUSTOTAL_API_KEY": "…",
  "SECURITYTRAILS_API_KEY": "…",
  "CENSYS_API_ID": "…",
  "CENSYS_API_SECRET": "…"
}
```

## Key options

| flag | meaning |
|------|---------|
| `-s, --sources a,b` | use only these sources |
| `-es, --exclude-sources a,b` | skip these sources |
| `--all` | run every source, including key-gated and active ones |
| `--resolve` / `--resolver doh\|system` | resolve names, pick backend |
| `--brute [WORDLIST]` | DNS brute force (built-in list if no file) |
| `--permute` | test permutations of found names |
| `--probe` | HTTP(S) probe |
| `--alive-only` | only output names that resolve |
| `-t N` | worker threads for resolve/brute/probe (default 50) |
| `--source-timeout S` | max seconds per source (default 180) |
| `--no-cache` | don't reuse/save cached per-source results |
| `--proxy URL` / `--insecure` | route source traffic through a proxy / skip TLS verify |
| `-dL file` | enumerate many domains from a file |

## Extending

Drop a new file in `subenum/sources/`. Subclass `Source`, set `name`, and yield raw strings from `enumerate(domain)` — the engine normalizes and de-duplicates them. See `subenum/sources/crtsh.py` for the pattern.

## Legal

Only enumerate domains you own or are explicitly authorized to assess. Passive sources query public third-party data; `--resolve`, `--brute` and `--probe` send DNS/HTTP traffic — use them only within an authorized scope.
