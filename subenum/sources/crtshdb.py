"""crt.sh via its public PostgreSQL database (guest, no password).

Independent of the often-overloaded crt.sh web API and usually more complete
(it includes certificates the JSON endpoint has not surfaced yet). Speaks the
PostgreSQL simple-query wire protocol directly, so no driver is needed.
"""
from __future__ import annotations

import socket
import struct
import time

from ..core import Source, SourceError

HOST, PORT, USER, DBNAME = "crt.sh", 5432, "guest", "certwatch"

# Query recommended by crt.sh: full-text match on identities, then an exact
# suffix filter so only real subdomains come back.
SQL = (
    "SELECT DISTINCT lower(cai.name_value) FROM certificate_and_identities cai "
    "WHERE plainto_tsquery('certwatch', '{d}') @@ identities(cai.certificate) "
    "AND cai.name_value ILIKE '%.{d}'"
)


def _read_exact(fh, n: int) -> bytes:
    data = fh.read(n)
    if data is None or len(data) < n:
        raise SourceError("crt.sh database closed the connection")
    return data


def _pg_error(payload: bytes) -> str:
    fields = {}
    for part in payload.split(b"\0"):
        if part:
            fields[chr(part[0])] = part[1:].decode("utf-8", "replace")
    return fields.get("M", "unknown error")


def pg_rows(sql: str, timeout: float = 120.0):
    """Yield the first column of every row returned by `sql`."""
    sock = socket.create_connection((HOST, PORT), timeout=timeout)
    try:
        fh = sock.makefile("rb")
        params = b"".join(
            k.encode() + b"\0" + v.encode() + b"\0"
            for k, v in (("user", USER), ("database", DBNAME), ("client_encoding", "UTF8"))
        ) + b"\0"
        body = struct.pack("!I", 196608) + params  # protocol 3.0
        sock.sendall(struct.pack("!I", len(body) + 4) + body)

        query_sent = False
        while True:
            head = _read_exact(fh, 5)
            kind, length = head[:1], struct.unpack("!I", head[1:])[0]
            payload = _read_exact(fh, length - 4)
            if kind == b"R":
                if struct.unpack("!I", payload[:4])[0] != 0:
                    raise SourceError("crt.sh database requested a password (guest access changed?)")
            elif kind == b"E":
                raise SourceError(f"crt.sh database: {_pg_error(payload)}")
            elif kind == b"Z":
                if query_sent:
                    return
                q = sql.encode() + b"\0"
                sock.sendall(b"Q" + struct.pack("!I", len(q) + 4) + q)
                query_sent = True
            elif kind == b"D":
                (ncols,) = struct.unpack("!H", payload[:2])
                if ncols:
                    (flen,) = struct.unpack("!i", payload[2:6])
                    if flen > 0:
                        yield payload[6 : 6 + flen].decode("utf-8", "replace")
            # S (parameter status), K (backend key), T (row description),
            # C (command complete), N (notice) need no handling.
    except OSError as e:
        raise SourceError(f"crt.sh database: {e}") from None
    finally:
        sock.close()


class CrtShDB(Source):
    name = "crtshdb"
    description = "Certificate Transparency logs via crt.sh PostgreSQL (more complete than the API)"

    def enumerate(self, domain):
        sql = SQL.format(d=domain.replace("'", "''"))
        last = None
        for attempt in range(3):  # the replica sometimes cancels long queries
            got = 0
            try:
                for name in pg_rows(sql):
                    got += 1
                    yield name
                return
            except SourceError as e:
                last = e
                if got:  # partial results already yielded; a retry would duplicate work
                    raise
                time.sleep(3 * (attempt + 1))
        raise last
